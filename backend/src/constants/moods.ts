/**
 * Canonical mood keys stored in DB; labels + emoji for API/UI consumption.
 */
export const MOODS = [
  { key: "OVERTHINKING", label: "Overthinking", emoji: "🌩️" },
  { key: "HAPPY", label: "Happy", emoji: "😊" },
  { key: "SAD", label: "Sad", emoji: "😔" },
  { key: "ANGRY", label: "Angry", emoji: "😡" },
  { key: "TIRED", label: "Tired", emoji: "😴" },
  { key: "BUSY", label: "Busy", emoji: "😵" },
  { key: "ANXIOUS", label: "Anxious", emoji: "😰" },
  { key: "LOVING", label: "Loving", emoji: "😍" },
  { key: "MISSING", label: "Missing", emoji: "🥺" },
  { key: "SICK", label: "Sick", emoji: "🤒" },
] as const;

export type MoodKey = (typeof MOODS)[number]["key"];

export const MOOD_KEYS = new Set<string>(MOODS.map((m) => m.key));

export function moodMeta(key: string) {
  return MOODS.find((m) => m.key === key) ?? { key, label: key, emoji: "❓" };
}
