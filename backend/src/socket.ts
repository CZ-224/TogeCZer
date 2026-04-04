import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { prisma } from "./lib/prisma.js";
import { verifyToken, type JwtPayload } from "./middleware/auth.js";
import { MOOD_KEYS } from "./constants/moods.js";
import { getRoomDetail } from "./routes/rooms.js";
import { registerIo, roomChannel } from "./realtime.js";
import { notifyPartnerOfMoodEmail } from "./lib/moodEmailNotify.js";
import {
  applyBombminerMove,
  applyConnectFourMove,
  applyRpsMove,
  applySinkTheShipMove,
  createGame,
  GAME_STATUSES,
  GAME_TYPES,
  parseGameState,
  type GameType,
} from "./lib/games.js";

export type RoomStatePayload = NonNullable<Awaited<ReturnType<typeof getRoomDetail>>>;

function socketUser(socket: Socket): JwtPayload {
  const data = socket.data as { user?: JwtPayload };
  if (!data.user) throw new Error("Unauthenticated socket");
  return data.user;
}

async function broadcastRoomState(io: Server, roomId: string) {
  const sockets = await io.in(roomChannel(roomId)).fetchSockets();
  await Promise.all(
    sockets.map(async (roomSocket) => {
      const user = (roomSocket.data as { user?: JwtPayload }).user;
      if (!user) return;
      const state = await getRoomDetail(roomId, user.sub);
      roomSocket.emit("room:state", state);
    })
  );
}

/**
 * Attach Socket.IO to the HTTP server.
 * Clients authenticate with `auth: { token }` on connect.
 */
export function attachSocket(httpServer: HttpServer, corsOrigin: string | string[]) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (typeof socket.handshake.query.token === "string" ? socket.handshake.query.token : undefined);
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }
    try {
      const payload = verifyToken(token);
      (socket.data as { user: JwtPayload }).user = payload;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    let joinedRoomId: string | null = null;

    /** Join the Socket.IO channel for a room after verifying DB membership. */
    socket.on("room:join", async (payload: { roomId?: string }, ack?: (e: unknown) => void) => {
      try {
        const roomId = payload?.roomId;
        if (!roomId) throw new Error("roomId required");

        const user = socketUser(socket);
        const member = await prisma.roomMember.findFirst({
          where: { roomId, userId: user.sub },
        });
        if (!member) throw new Error("Forbidden");

        if (joinedRoomId && joinedRoomId !== roomId) {
          socket.leave(roomChannel(joinedRoomId));
        }
        joinedRoomId = roomId;
        socket.join(roomChannel(roomId));

        const state = await getRoomDetail(roomId, user.sub);
        socket.emit("room:state", state);
        ack?.(null);
      } catch (e) {
        ack?.({ error: String(e) });
      }
    });

    /** Persist mood and broadcast fresh room state to both partners. */
    socket.on(
      "mood:set",
      async (payload: { roomId?: string; moodType?: string }, ack?: (e: unknown) => void) => {
        try {
          const user = socketUser(socket);
          const roomId = payload?.roomId;
          const moodType = String(payload?.moodType ?? "").toUpperCase();

          if (!roomId) throw new Error("roomId required");
          if (!MOOD_KEYS.has(moodType)) throw new Error("Invalid mood");

          const member = await prisma.roomMember.findFirst({
            where: { roomId, userId: user.sub },
          });
          if (!member) throw new Error("Forbidden");

          const room = await prisma.room.findUnique({
            where: { id: roomId },
            include: { members: true },
          });
          if (!room || room.members.length < 2) {
            throw new Error("Room not active");
          }

          await prisma.moodStatus.upsert({
            where: { userId_roomId: { userId: user.sub, roomId } },
            create: { userId: user.sub, roomId, moodType },
            update: { moodType },
          });

          await broadcastRoomState(io, roomId);
          void notifyPartnerOfMoodEmail(roomId, user.sub, moodType);
          ack?.(null);
        } catch (e) {
          ack?.({ error: String(e) });
        }
      }
    );

    socket.on(
      "game:start",
      async (payload: { roomId?: string; gameType?: string }, ack?: (e: unknown) => void) => {
        try {
          const user = socketUser(socket);
          const roomId = payload?.roomId;
          const gameType = String(payload?.gameType ?? "").toUpperCase() as GameType;

          if (!roomId) throw new Error("roomId required");
          if (!Object.values(GAME_TYPES).includes(gameType)) {
            throw new Error("Unknown game type");
          }

          const room = await prisma.room.findUnique({
            where: { id: roomId },
            include: { members: true },
          });

          if (!room) throw new Error("Room not found");
          const memberIds = room.members.map((member) => member.userId);
          if (!memberIds.includes(user.sub)) throw new Error("Forbidden");
          if (memberIds.length !== 2) throw new Error("Both partners must join before playing");

          const nextGame = createGame(gameType, memberIds);
          await prisma.room.update({
            where: { id: roomId },
            data: nextGame,
          });

          await broadcastRoomState(io, roomId);
          ack?.(null);
        } catch (e) {
          ack?.({ error: String(e) });
        }
      }
    );

    socket.on(
      "game:move",
      async (
        payload: { roomId?: string; move?: { kind?: string; index?: number; column?: number; choice?: string } },
        ack?: (e: unknown) => void
      ) => {
        try {
          const user = socketUser(socket);
          const roomId = payload?.roomId;
          if (!roomId) throw new Error("roomId required");

          const room = await prisma.room.findUnique({
            where: { id: roomId },
            include: { members: true },
          });

          if (!room) throw new Error("Room not found");
          const memberIds = room.members.map((member) => member.userId);
          if (!memberIds.includes(user.sub)) throw new Error("Forbidden");
          if (room.gameStatus !== GAME_STATUSES.ACTIVE || !room.gameType) {
            throw new Error("No active game");
          }
          if (room.gameTurnUserId !== user.sub) {
            throw new Error("Wait for your turn");
          }

          const parsedState = parseGameState(room.gameType, room.gameState);
          if (!parsedState) throw new Error("Game state missing");

          let nextGame: {
            gameState: typeof parsedState;
            gameStatus: string;
            gameTurnUserId: string | null;
            gameWinnerUserId: string | null;
          };

          if (room.gameType === GAME_TYPES.BOMBMINER) {
            if (parsedState.kind !== "BOMBMINER") throw new Error("Bombminer state invalid");
            const result = applyBombminerMove(parsedState, memberIds, user.sub, payload?.move?.index);
            nextGame = { ...result, gameState: result.state };
          } else if (room.gameType === GAME_TYPES.CONNECT_FOUR) {
            if (parsedState.kind !== "CONNECT_FOUR") throw new Error("Connect Four state invalid");
            const result = applyConnectFourMove(parsedState, memberIds, user.sub, payload?.move?.column);
            nextGame = { ...result, gameState: result.state };
          } else if (room.gameType === GAME_TYPES.ROCK_PAPER_SCISSORS) {
            if (parsedState.kind !== "ROCK_PAPER_SCISSORS") throw new Error("RPS state invalid");
            const result = applyRpsMove(parsedState, memberIds, user.sub, payload?.move?.choice);
            nextGame = { ...result, gameState: result.state };
          } else if (room.gameType === GAME_TYPES.SINK_THE_SHIP) {
            if (parsedState.kind !== "SINK_THE_SHIP") throw new Error("Sink the Ship state invalid");
            const result = applySinkTheShipMove(parsedState, memberIds, user.sub, payload?.move?.index);
            nextGame = { ...result, gameState: result.state };
          } else {
            throw new Error("Unknown game type");
          }

          await prisma.room.update({
            where: { id: roomId },
            data: {
              gameState: nextGame.gameState,
              gameStatus: nextGame.gameStatus,
              gameTurnUserId: nextGame.gameTurnUserId,
              gameWinnerUserId: nextGame.gameWinnerUserId,
              gameUpdatedAt: new Date(),
            },
          });

          await broadcastRoomState(io, roomId);
          ack?.(null);
        } catch (e) {
          ack?.({ error: String(e) });
        }
      }
    );

    socket.on("disconnect", () => {
      joinedRoomId = null;
    });
  });

  registerIo(io);
  return io;
}
