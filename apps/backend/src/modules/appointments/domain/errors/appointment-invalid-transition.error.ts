import { DomainError } from '../../../../domain/errors/domain.error';
import type { AppointmentStatus } from '@delta/shared-types';
import { ESTADOS_FINALES, nombreDeEstado } from '../appointment-status-names';

/**
 * Se lanza al intentar un cambio de estado que la máquina de estados no permite.
 *
 * El mensaje decía «No se puede pasar la cita de 'completed' a 'no_show'»: las
 * claves internas, en inglés, dentro de un texto en español. El
 * `GlobalExceptionFilter` lo reenvía tal cual al navegador.
 */
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
    if (ESTADOS_FINALES.has(from)) {
      return (
        `Esta cita ya quedó ${nombreDeEstado(from)} y no se puede volver a cambiar. ` +
        `Si necesitás corregirlo, escribile al soporte de Delta Salud.`
      );
    }
    return `Una cita ${nombreDeEstado(from)} no se puede pasar a ${nombreDeEstado(to)}.`;
  }
}
