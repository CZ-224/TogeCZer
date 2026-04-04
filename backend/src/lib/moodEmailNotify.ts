import nodemailer from "nodemailer";
import { prisma } from "./prisma.js";
import { moodMeta } from "../constants/moods.js";
import type { RoomMemberWithUserEmail } from "../types/roomPayload.js";

/**
 * When NOTIFY_MOOD_EMAIL=true and SMTP_* are set, sends the partner a short email
 * after a mood change (Gmail works with an App Password on the sender account).
 * Failures are logged only — they never block the HTTP/socket response.
 */
export async function notifyPartnerOfMoodEmail(roomId: string, senderUserId: string, moodType: string) {
  if (process.env.NOTIFY_MOOD_EMAIL !== "true") {
    return;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.warn("[moodEmail] NOTIFY_MOOD_EMAIL=true but SMTP_USER/SMTP_PASS missing — skipping");
    return;
  }

  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    if (!room || room.members.length < 2) return;

    const members = room.members as RoomMemberWithUserEmail[];
    const partnerRow = members.find((row) => row.userId !== senderUserId);
    if (!partnerRow) return;

    const partnerEmail = partnerRow.user.email;
    const senderRow = members.find((row) => row.userId === senderUserId);
    const senderHint = senderRow?.user.email.split("@")[0] ?? "Your partner";

    const meta = moodMeta(moodType);
    const subject = `Together — ${senderHint} shared: ${meta.emoji} ${meta.label}`;

    const publicRoomUrl = process.env.PUBLIC_WEB_URL?.replace(/\/$/, "") ?? "";
    const bodyLines = [
      `${senderHint} updated their mood in your shared room.`,
      ``,
      `${meta.emoji} ${meta.label}`,
      ``,
      publicRoomUrl
        ? `Open the app: ${publicRoomUrl}`
        : `Open your Together room in the browser to see the latest.`,
      ``,
      `— Together`,
    ];

    const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT ?? "465");
    const secure = (process.env.SMTP_SECURE ?? "true") !== "false";

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const from =
      process.env.MOOD_EMAIL_FROM ?? `Together <${user}>`;

    await transporter.sendMail({
      from,
      to: partnerEmail,
      subject,
      text: bodyLines.join("\n"),
    });

    console.info("[moodEmail] Sent mood notification to partner");
  } catch (e) {
    console.error("[moodEmail] Failed to send:", e);
  }
}
