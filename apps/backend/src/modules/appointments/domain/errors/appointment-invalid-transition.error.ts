import { DomainError } from '../../../../domain/errors/domain.error';
import { allowedAppointmentTransitions } from '@delta/shared-types';
import type { AppointmentStatus } from '@delta/shared-types';
import { ESTADOS_FINALES, nombreDeEstado } from '../appointment-status-names';

/**
 * Se lanza al intentar un cambio de estado que la máquina de estados no permite.
 *
 * El mensaje lo lee un especialista, no un desarrollador: el
 * `GlobalExceptionFilter` lo reenvía tal cual al navegador. Decía «No se puede
 * pasar la cita de 'completed' a 'no_show'» — claves internas, en inglés, dentro
 * de un texto en español.
 *
 * Y no alcanzaba con traducirlo. En producción (2026-09-11) una especialista
 * canceló una cita, la pantalla no se lo reflejó, y al reintentar recibió dos
 * mensajes distintos para la misma falla: uno del BFF que no nombraba ningún
 * estado y otro del dominio que los nombraba en inglés. Entre los dos no podía
 * saber que su cancelación YA había funcionado. Por eso el mensaje ahora dice
 * también qué queda por hacer.
 */
export class AppointmentInvalidTransitionError extends DomainError {
  readonly code = 'APPOINTMENT_INVALID_TRANSITION';

  /**
   * Las salidas posibles se derivan de `from`, NO se reciben por parámetro.
   *
   * Recibirlas con un default `[]` hacía que cualquier construcción de dos
   * argumentos —las que ya existían en el código— cayera en la rama de "estado
   * final" y le dijera a la especialista que una cita agendada no se puede
   * cambiar más. Derivarlas acá vuelve imposible ese mensaje equivocado.
   */
  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(AppointmentInvalidTransitionError.mensaje(from, to));
  }

  /**
   * Explica QUÉ pasó y qué queda por hacer, en vez de nombrar la transición
   * prohibida.
   *
   * El caso frecuente es el estado final: la cita ya se cerró y se intenta
   * cambiarla. Ahí lo útil no es "no se puede", sino que ya quedó registrada de
   * otra forma — y que el camino para corregirlo existe pero no es ese botón.
   */
  private static mensaje(from: AppointmentStatus, to: AppointmentStatus): string {
    const allowed = allowedAppointmentTransitions(from);

    if (ESTADOS_FINALES.has(from) || allowed.length === 0) {
      return (
        `Esta cita ya quedó ${nombreDeEstado(from)} y no se puede volver a cambiar. ` +
        `Si necesitás corregirlo, escribile al soporte de Delta Salud.`
      );
    }

    const opciones = allowed.map((s) => nombreDeEstado(s)).join(', ');
    return (
      `Una cita ${nombreDeEstado(from)} no se puede pasar a ${nombreDeEstado(to)}. ` +
      `Desde acá solo se puede dejar: ${opciones}.`
    );
  }
}
