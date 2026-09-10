import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Se lanza al intentar corregir el servicio de una cita por otro que NO tiene el
 * mismo número de sesiones.
 *
 * Cambiar entre servicios de distinto tamaño obligaría a crear o borrar
 * preconsultas y a decidir qué pasa con las sesiones ya agendadas: un paquete de
 * 4 que pasa a uno de 2 deja dos citas huérfanas. Mientras eso no esté resuelto,
 * la corrección se limita a servicios equivalentes.
 */
export class ServiceChangeNotEquivalentError extends DomainError {
  readonly code = 'SERVICE_CHANGE_NOT_EQUIVALENT';

  constructor(currentSessions: number, newSessions: number) {
    super(
      `Solo se puede cambiar entre servicios del mismo número de consultas. ` +
        `El actual tiene ${currentSessions} y el elegido ${newSessions}.`,
    );
  }
}
