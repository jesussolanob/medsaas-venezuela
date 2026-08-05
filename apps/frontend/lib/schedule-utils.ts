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
