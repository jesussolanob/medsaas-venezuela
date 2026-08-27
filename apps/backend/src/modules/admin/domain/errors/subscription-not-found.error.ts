import { DomainError } from '../../../../domain/errors/domain.error';

export class SubscriptionNotFoundError extends DomainError {
  readonly code = 'SUBSCRIPTION_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_doctorId?: string) {
    super('Suscripción no encontrada');
  }
}
