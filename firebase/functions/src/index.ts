/**
 * Cloud Functions for Together — sends an FCM notification when a mood
 * or single reply note changes under `rooms/{roomId}/moods/{userId}`.
 */
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

initializeApp();

// Change region if you standardize on something closer to your users (e.g. europe-west1).
export const notifyPartnerMood = onDocumentWritten(
  {
    document: "rooms/{roomId}/moods/{userId}",
    region: "europe-west1",
  },
  async (event) => {
    const roomId = event.params.roomId as string;
    const moodUserId = event.params.userId as string;

    const after = event.data?.after?.data();
    if (!after) {
      return;
    }

    const db = getFirestore();
    const roomSnap = await db.doc(`rooms/${roomId}`).get();
    if (!roomSnap.exists) {
      return;
    }

    const members = roomSnap.get("members") as string[] | undefined;
    if (!members || members.length === 0) {
      return;
    }

    const partnerId = members.find((m) => m !== moodUserId);
    if (!partnerId) {
      return;
    }

    const partnerSnap = await db.doc(`users/${partnerId}`).get();
    const token = partnerSnap.get("fcmToken") as string | undefined;
    if (!token) {
      logger.info("Partner has no FCM token yet", {roomId, partnerId});
      return;
    }

    const before = event.data?.before?.data();
    const emoji = String(after.emoji ?? "");
    const label = String(after.label ?? "Mood update");
    const note = String(after.note ?? "").trim();
    const replyNote = String(after.replyNote ?? "").trim();
    const replyChanged = String(before?.replyNote ?? "").trim() != replyNote && replyNote.length > 0;

    const title = replyChanged ? "Your partner replied" : "Your partner shared a mood";
    const body = replyChanged
      ? replyNote
      : [emoji, label, note].filter((part) => part.length > 0).join(" • ");

    await getMessaging().send({
      token,
      notification: {
        title,
        body: body.length > 0 ? body : "Tap to open Together",
      },
      data: {
        roomId,
        type: replyChanged ? "reply" : "mood",
      },
    });

    logger.info("notifyPartnerMood delivered", {roomId, partnerId, type: replyChanged ? "reply" : "mood"});
  }
);
