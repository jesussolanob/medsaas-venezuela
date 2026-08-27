import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an immediate-consultation request is made but there is no usable
 * time window available (less than 5 minutes before the next active appointment).
 *
 * HTTP 409 Conflict: the server understands the request but the current state
 * of the resource (the doctor's schedule) prevents it from being fulfilled.
 *
 * Callers can retry with `force: true` to override the overlap check and
 * schedule the consultation at full duration regardless of the next appointment.
 */
export class NoImmediateSlotError extends DomainError {
  readonly code = 'NO_IMMEDIATE_SLOT';
  override readonly httpStatus = 409;

  constructor(availableMinutes: number) {
    // El especialista LEE este mensaje: se le muestra al intentar registrar la
    // consulta inmediata. Estaba en inglés — se escapó del barrido de idioma
    // del 18/08 porque el detector buscaba mensajes sin acentos ni palabras en
    // español, y éste no tiene ninguna de las dos cosas sin ser español.
    const minutos =
      availableMinutes === 1 ? 'queda 1 minuto libre' : `quedan ${availableMinutes} minutos libres`;
    super(
      `No hay tiempo para una consulta inmediata: solo ${minutos} antes de la próxima cita. ` +
        'Podés registrarla igual y se va a cruzar con esa cita.',
    );
  }
}
