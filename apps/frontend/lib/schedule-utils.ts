/**
 * lib/schedule-utils.ts
 *
 * Shared schedule types and helpers used by both the offices module and the
 * onboarding wizard step 2.  Extracted to a plain utility module so both
 * 'use client' components can import without touching a 'use server' boundary.
 */

export type DaySchedule = {
  day: number; // 0 = Lunes ... 6 = Domingo
  enabled: boolean;
  start: string; // HH:MM
  end: string; // HH:MM
};

export type OverlapError = {
  /** Index of the first overlapping block. */
  a: number;
  /** Index of the second overlapping block. */
  b: number;
};

export const DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/** Default schedule: Mon–Fri 08:00–17:00, Sat–Sun disabled. */
export const DEFAULT_SCHEDULE: DaySchedule[] = DAYS.map((_, i) => ({
  day: i,
  enabled: i < 5,
  start: '08:00',
  end: '17:00',
}));

/** Converts an HH:MM string to minutes since midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Converts minutes since midnight back to HH:MM, zero-padded. */
function minutesToTime(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Given the end time of a day's last block, suggests where the next one starts:
 * two hours later, capped at 18:00. Models the usual break between the morning
 * and afternoon shift.
 */
export function suggestNextStart(lastEnd: string): string {
  return minutesToTime(Math.min(timeToMinutes(lastEnd) + 120, 18 * 60));
}

/** Suggests the end of a block from its start: four hours later, capped at 22:00. */
export function suggestNextEnd(nextStart: string): string {
  return minutesToTime(Math.min(timeToMinutes(nextStart) + 240, 22 * 60));
}

// ---------------------------------------------------------------------------
// Block operations
//
// Pure functions over the flat DaySchedule array: they take a schedule and
// return a NEW one, so a caller just does `setSchedule(addBlock(schedule, day))`.
//
// These lived inline in the offices page while the onboarding step had its own,
// simpler version limited to ONE block per day. That drift is exactly why a
// specialist could split morning and afternoon from Consultorios but not while
// onboarding. Shared here so both screens can only behave the same way.
// ---------------------------------------------------------------------------

/**
 * Turns a whole day on or off.
 *
 * Off → every block of that day is marked disabled (kept, not deleted, so the
 * hours survive if the day is turned back on).
 * On  → re-enables the existing blocks, or seeds one 08:00–17:00 if the day
 * had none at all.
 */
export function toggleDay(schedule: DaySchedule[], dayNum: number): DaySchedule[] {
  const blocksForDay = schedule.filter((b) => b.day === dayNum);
  const isEnabled = blocksForDay.some((b) => b.enabled);

  if (isEnabled) {
    return schedule.map((b) => (b.day === dayNum ? { ...b, enabled: false } : b));
  }
  if (blocksForDay.length > 0) {
    return schedule.map((b) => (b.day === dayNum ? { ...b, enabled: true } : b));
  }
  return [...schedule, { day: dayNum, enabled: true, start: '08:00', end: '17:00' }];
}

/** Updates one field of a single block, addressed by its index in the flat array. */
export function updateBlock(
  schedule: DaySchedule[],
  blockIndex: number,
  field: 'start' | 'end',
  value: string,
): DaySchedule[] {
  return schedule.map((b, i) => (i === blockIndex ? { ...b, [field]: value } : b));
}

/** Removes a block by index. If it was the day's only one, the day ends up with none. */
export function removeBlock(schedule: DaySchedule[], blockIndex: number): DaySchedule[] {
  return schedule.filter((_, i) => i !== blockIndex);
}

/**
 * Appends a block to a day, starting after the last existing one so the new
 * row does not overlap what is already there.
 */
export function addBlock(schedule: DaySchedule[], dayNum: number): DaySchedule[] {
  const blocksForDay = schedule.filter((b) => b.day === dayNum && b.enabled);

  let start = '08:00';
  let end = '12:00';
  if (blocksForDay.length > 0) {
    const lastEnd = blocksForDay[blocksForDay.length - 1]?.end ?? '12:00';
    start = suggestNextStart(lastEnd);
    end = suggestNextEnd(start);
  }

  return [...schedule, { day: dayNum, enabled: true, start, end }];
}

/**
 * Returns pairs of overlapping block indices for a flat DaySchedule array.
 * Two blocks overlap if they share the same day and their time intervals intersect.
 * Blocks with start >= end are skipped (they are invalid but handled separately).
 */
export function findOverlaps(schedule: DaySchedule[]): OverlapError[] {
  const errors: OverlapError[] = [];
  const enabledByDay = new Map<number, { idx: number; start: number; end: number }[]>();

  schedule.forEach((block, idx) => {
    if (!block.enabled) return;
    const startMin = timeToMinutes(block.start);
    const endMin = timeToMinutes(block.end);
    if (startMin >= endMin) return; // invalid block — not checked for overlap here
    const existing = enabledByDay.get(block.day) ?? [];
    for (const other of existing) {
      if (startMin < other.end && endMin > other.start) {
        errors.push({ a: other.idx, b: idx });
      }
    }
    existing.push({ idx, start: startMin, end: endMin });
    enabledByDay.set(block.day, existing);
  });

  return errors;
}
