/**
 * Plain shapes for strict TypeScript in routes/helpers.
 * Mirrors Prisma results so `tsc` passes even if client generation is skipped in CI.
 */
export type RoomMemberWithUserEmail = {
  userId: string;
  user: { id: string; email: string };
};

export type MoodStatusRow = {
  userId: string;
  moodType: string;
  updatedAt: Date;
};

export type RoomMemberIdRow = {
  userId: string;
};
