/**
 * Disponibilidad de horarios POR INTERVALO.
 *
 * Un turno ocupa el tiempo que dura, no un punto en el reloj. Antes se marcaba
 * ocupada solo la hora de INICIO de cada cita, así que:
 *
 *   - Una cita de 45' a las 08:00 en una grilla de 30' dejaba el 08:30 como
 *     libre: se ofrecía un horario que el backend después rechazaba por
 *     solapamiento (el paciente llenaba todo el formulario para nada).
 *   - Una cita a las 14:37 (hora libre) marcaba ocupado "14:37", que ni
 *     siquiera existe en la grilla: no bloqueaba absolutamente nada.
 *
 * Estas funciones son puras y sin dependencias de zona horaria a propósito:
 * cada pantalla convierte sus fechas a "minutos desde medianoche" con el
 * helper que ya usa, y acá solo se cruzan intervalos.
 */

/** Duración que se asume para citas viejas sin `duration_minutes` guardado. */
export const DEFAULT_APPOINTMENT_MINUTES = 30;

/** Intervalo ocupado, en minutos desde la medianoche del día que se mira. */
export type BookedInterval = {
  startMin: number;
  durationMin: number;
};

/** "HH:MM" → minutos desde medianoche. */
export function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * ¿El slot se cruza con alguna cita?
 *
 * Dos intervalos [a, a+da) y [b, b+db) se cruzan cuando a < b+db && b < a+da.
 * Los extremos NO cuentan como cruce: una cita que termina 08:45 deja libre un
 * slot que empieza 08:45.
 */
export function isSlotBlocked(
  slotStartMin: number,
  slotDurationMin: number,
  booked: BookedInterval[],
): boolean {
  const slotEnd = slotStartMin + slotDurationMin;
  return booked.some((b) => slotStartMin < b.startMin + b.durationMin && b.startMin < slotEnd);
}

/**
 * Filtra los horarios de una grilla y devuelve los que quedan OCUPADOS.
 *
 * `slots` trae la duración de cada horario porque cada bloque del consultorio
 * puede tener la suya (ADR-028): la mañana de 45' y la tarde de 20'.
 */
export function blockedTimes(
  slots: { time: string; durationMin: number }[],
  booked: BookedInterval[],
): Set<string> {
  const blocked = new Set<string>();
  for (const slot of slots) {
    if (isSlotBlocked(hhmmToMinutes(slot.time), slot.durationMin, booked)) {
      blocked.add(slot.time);
    }
  }
  return blocked;
}
