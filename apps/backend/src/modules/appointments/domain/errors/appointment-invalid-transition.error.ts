import { DomainError } from '../../../../domain/errors/domain.error';
import type { AppointmentStatus } from '@delta/shared-types';

/**
 * Nombres que la app usa EN PANTALLA para cada estado.
 *
 * El mensaje de este error lo lee un especialista, no un desarrollador: decía
 * "No se puede pasar la cita de 'completed' a 'no_show'" y filtraba las claves
 * internas, que además están en inglés. El `GlobalExceptionFilter` reenvía este
 * texto tal cual al navegador, así que es literalmente lo que ve la persona.
 *
 * La taxonomía sale de `CLAUDE.md`: `completed` es "atendida" (el paciente vino),
 * no "completada".
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
const FINALES = new Set(['completed', 'cancelled', 'no_show']);

function nombre(estado: AppointmentStatus): string {
  return NOMBRES[estado] ?? estado;
}

export class AppointmentInvalidTransitionError extends DomainError {
  readonly code = 'APPOINTMENT_INVALID_TRANSITION';

  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(AppointmentInvalidTransitionError.mensaje(from, to));
  }

  /**
   * Explica QUÉ pasó y por qué, en vez de nombrar la transición prohibida.
   *
   * El caso frecuente es el estado final: la cita ya se cerró y se intenta
   * cambiarla. Ahí lo útil no es "no se puede", sino que ya quedó registrada de
   * otra forma — y que el camino para corregirlo existe pero no es ese botón.
   */
  private static mensaje(from: AppointmentStatus, to: AppointmentStatus): string {
    if (FINALES.has(from)) {
      return (
        `Esta cita ya quedó ${nombre(from)} y no se puede volver a cambiar. ` +
        `Si necesitás corregirlo, escribile al soporte de Delta Salud.`
      );
    }
    return `Una cita ${nombre(from)} no se puede pasar a ${nombre(to)}.`;
  }
}
