import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Se lanza cuando el servicio elegido para la corrección no existe, es de otro
 * especialista o está desactivado en el catálogo.
 *
 * El mensaje es el MISMO en los tres casos a propósito: "es de otro especialista"
 * le confirmaría a quien prueba IDs ajenos que ese ID existe.
 */
export class ServiceNotAvailableError extends DomainError {
  readonly code = 'SERVICE_NOT_AVAILABLE';

  constructor() {
    super('El servicio elegido no está disponible');
  }
}
