import type { AppointmentStatus } from '@delta/shared-types';

/**
 * Nombres que la app usa EN PANTALLA para cada estado de una cita.
 *
 * Los mensajes de los errores de dominio los lee un especialista, no un
 * desarrollador: el `GlobalExceptionFilter` reenvía el texto tal cual al
 * navegador, así que es literalmente lo que sale en la pantalla. Nombrar el
 * estado con su clave interna filtra inglés en una UI en español.
 *
 * La taxonomía sale de `CLAUDE.md`: `completed` es "atendida" (el paciente
 * vino), no "completada".
 */
const NOMBRES: Record<string, string> = {
  scheduled: 'agendada',
  confirmed: 'aprobada',
  cancelled: 'cancelada',
  completed: 'atendida',
  no_show: 'marcada como no asistió',
  pending: 'pendiente',
  accepted: 'aceptada',
};

/** Estados de los que ya no se sale: una vez ahí, la cita quedó cerrada. */
export const ESTADOS_FINALES = new Set(['completed', 'cancelled', 'no_show']);

/**
 * Nombre en español del estado.
 *
 * Devuelve la clave cruda si no la conoce: es preferible que se lea `rejected` a
 * que el mensaje quede sin el dato. `AppointmentStatus` puede crecer.
 */
export function nombreDeEstado(estado: AppointmentStatus | string): string {
  return NOMBRES[estado] ?? estado;
}

/**
 * Fecha y hora legibles, en horario de Caracas.
 *
 * Existe porque los mensajes imprimían `toISOString()` y el especialista leía
 * "2026-08-19T17:27:44.419Z": una marca UTC con milisegundos que además no es la
 * hora que ve en su agenda.
 */
export function fechaLegible(fecha: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Caracas',
  }).format(fecha);
}
