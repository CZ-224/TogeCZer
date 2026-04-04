import { Router } from "express";
import { customAlphabet } from "nanoid";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { MOOD_KEYS, moodMeta } from "../constants/moods.js";
import { getIo, roomChannel } from "../realtime.js";
import { sanitizeGameState } from "../lib/games.js";
import { notifyPartnerOfMoodEmail } from "../lib/moodEmailNotify.js";
import type { MoodStatusRow, RoomMemberIdRow, RoomMemberWithUserEmail } from "../types/roomPayload.js";

const router = Router();

/** Readable invite codes (no ambiguous chars). */
const inviteCode = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

/** Express 5 may type `req.params` values as `string | string[]`; normalize to a single id. */
function singleParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

/**
 * Build full room payload: members + latest mood per user.
 * Used by REST and can mirror socket broadcasts.
 */
async function getRoomDetail(roomId: string, viewerUserId?: string | null) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: {
          user: { select: { id: true, email: true } },
        },
      },
      moods: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!room) return null;

  const moodByUser = new Map<string, MoodStatusRow>();
  for (const m of room.moods as MoodStatusRow[]) {
    if (!moodByUser.has(m.userId)) moodByUser.set(m.userId, m);
  }

  const partnerMoods = (room.members as RoomMemberWithUserEmail[]).map((mem: RoomMemberWithUserEmail) => {
    const mood = moodByUser.get(mem.userId);
    if (!mood) {
      return { userId: mem.user.id, email: mem.user.email, mood: null };
    }
    const meta = moodMeta(mood.moodType);
    return {
      userId: mem.user.id,
      email: mem.user.email,
      mood: {
        type: meta.key,
        label: meta.label,
        emoji: meta.emoji,
        updatedAt: mood.updatedAt,
      },
    };
  });

  return {
    id: room.id,
    inviteCode: room.inviteCode,
    createdAt: room.createdAt,
    memberCount: room.members.length,
    isActive: room.members.length === 2,
    partners: partnerMoods,
    game: sanitizeGameState({
      gameType: room.gameType,
      gameStatus: room.gameStatus,
      gameState: room.gameState,
      gameTurnUserId: room.gameTurnUserId,
      gameWinnerUserId: room.gameWinnerUserId,
      gameUpdatedAt: room.gameUpdatedAt,
    }, viewerUserId ?? null),
  };
}

/** POST /rooms — create a private room; creator is first member. */
router.post("/", requireAuth, async (req, res) => {
  let code = inviteCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.room.findUnique({ where: { inviteCode: code } });
    if (!clash) break;
    code = inviteCode();
  }

  const room = await prisma.room.create({
    data: {
      inviteCode: code,
      createdById: req.userId!,
      members: { create: { userId: req.userId! } },
    },
    select: { id: true, inviteCode: true, createdAt: true },
  });

  const detail = await getRoomDetail(room.id);
  res.status(201).json(detail);
});

/** GET /rooms/by-code/:code — resolve invite code (for deep links). */
router.get("/by-code/:code", requireAuth, async (req, res) => {
  const code = singleParam(req.params.code).toUpperCase();
  const room = await prisma.room.findUnique({
    where: { inviteCode: code },
    select: { id: true, inviteCode: true },
  });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ roomId: room.id, inviteCode: room.inviteCode });
});

/** POST /rooms/:roomId/join — join if room has space and user not already in. */
router.post("/:roomId/join", requireAuth, async (req, res) => {
  const roomId = singleParam(req.params.roomId);

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { members: true },
  });

  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const already = (room.members as RoomMemberIdRow[]).some((m) => m.userId === req.userId);
  if (already) {
    const detail = await getRoomDetail(roomId);
    res.json(detail);
    return;
  }

  if (room.members.length >= 2) {
    res.status(403).json({
      error: "Room is full",
      details: "This room already has two partners.",
    });
    return;
  }

  await prisma.roomMember.create({
    data: { roomId, userId: req.userId! },
  });

  const detail = await getRoomDetail(roomId);
  // Wake the waiting partner's socket session as soon as the second person joins.
  const io = getIo();
  if (detail && io) {
    io.to(roomChannel(roomId)).emit("room:state", detail);
  }
  res.json(detail);
});

/** GET /rooms/:roomId — full state for initial load / refresh. */
router.get("/:roomId", requireAuth, async (req, res) => {
  const roomId = singleParam(req.params.roomId);
  const member = await prisma.roomMember.findFirst({
    where: { roomId, userId: req.userId! },
  });
  if (!member) {
    res.status(403).json({ error: "Not a member of this room" });
    return;
  }
  const detail = await getRoomDetail(roomId);
  res.json(detail);
});

/** PATCH /rooms/:roomId/mood — REST fallback for mood (real-time via socket preferred). */
router.patch("/:roomId/mood", requireAuth, async (req, res) => {
  const roomId = singleParam(req.params.roomId);
  const moodType = String(req.body?.moodType ?? "").toUpperCase();

  if (!MOOD_KEYS.has(moodType)) {
    res.status(400).json({ error: "Invalid mood type" });
    return;
  }

  const member = await prisma.roomMember.findFirst({
    where: { roomId, userId: req.userId! },
  });
  if (!member) {
    res.status(403).json({ error: "Not a member of this room" });
    return;
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { members: true },
  });
  if (!room || room.members.length < 2) {
    res.status(423).json({
      error: "Room not active",
      details: "Both partners must join before sharing moods.",
    });
    return;
  }

  await prisma.moodStatus.upsert({
    where: {
      userId_roomId: { userId: req.userId!, roomId },
    },
    create: { userId: req.userId!, roomId, moodType },
    update: { moodType },
  });

  const detail = await getRoomDetail(roomId);
  void notifyPartnerOfMoodEmail(roomId, req.userId!, moodType);
  res.json(detail);
});

export default router;
export { getRoomDetail };
