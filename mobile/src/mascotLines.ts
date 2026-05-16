/**
 * Mochi-voice greeting tagline. Time-of-day + plate-aware variants picked
 * deterministically from the day's date so the line stays the same across
 * a session but rotates daily. Anxiety-friendly tone — no exclamation
 * marks, no "let's crush it!", never goal-oriented.
 *
 * Pure module — no React, no platform deps. Lives in mobile/ rather than
 * core/ because the lines are mobile-specific copy. Web has its own
 * mascot voice in its store.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening";

export const MASCOT_LINES: Record<
  TimeOfDay,
  { fresh: string[]; going: string[] }
> = {
  morning: {
    fresh: [
      "Mochi's here. Take it slow today.",
      "Quiet start. One thing at a time.",
      "Mochi's stretching. So can you.",
      "No rush. The day's just opening.",
      "Mochi's waiting. Pick the smallest.",
      "A clean morning. Yours for the choosing.",
      "Pace yourself. Mochi insists.",
      "Light start, light steps.",
    ],
    going: [
      "Steady morning. Mochi's pacing.",
      "Nice rhythm. Keep it gentle.",
      "Mochi sees you. Carry on.",
      "One pebble at a time.",
      "Easy does it. The day's wide open.",
      "Soft start, real progress.",
    ],
  },
  afternoon: {
    fresh: [
      "Afternoon, Mochi-style. Slow is fine.",
      "One small thing — that's enough for now.",
      "Mochi's still pacing. No hurry.",
      "Pick something tiny. The rest will keep.",
      "Quiet middle of the day. No agenda required.",
      "Mochi's nearby. You can rest here too.",
    ],
    going: [
      "Mochi's halfway there. So are you.",
      "Steady on. The rest can wait.",
      "Quiet progress. Mochi approves.",
      "Keep the pace. No need to push.",
      "Soft afternoon. You're moving fine.",
      "One pebble more, then a breath.",
    ],
  },
  evening: {
    fresh: [
      "Evening. Mochi's curling up.",
      "Wind down. Tomorrow has more time.",
      "Slow now. Today did its part.",
      "Mochi's resting. You can too.",
      "Quiet hour. Nothing else needs doing.",
      "Day's almost done. So is Mochi.",
    ],
    going: [
      "Mochi's settling. Save the rest.",
      "Quiet end. Well done.",
      "One last gentle thing — or none.",
      "Tomorrow's pebbles can wait.",
      "Light off the day. You've earned it.",
      "Mochi's content. So can you be.",
    ],
  },
};

/**
 * Day-stable seed from an ISO yyyy-mm-dd string. Sums the digit groups so
 * the value rolls over predictably across days but stays steady within
 * a single calendar day.
 */
export function dateSeed(isoDate: string): number {
  return isoDate.split("-").reduce((acc, part) => acc + Number(part), 0);
}

/**
 * Picks a mascot line for the given time-of-day + plate state. `today` is
 * the local ISO date string used as the rotation seed; passed in (rather
 * than read from a clock) so this function stays pure and testable.
 */
export function pickMascotLine(
  timeOfDay: TimeOfDay,
  plateCount: number,
  today: string,
): string {
  const set = MASCOT_LINES[timeOfDay];
  const variants = plateCount === 0 ? set.fresh : set.going;
  return variants[dateSeed(today) % variants.length];
}
