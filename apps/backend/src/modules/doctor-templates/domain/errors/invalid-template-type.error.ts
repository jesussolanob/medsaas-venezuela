import { DomainError } from '../../../../domain/errors/domain.error';

export class InvalidTemplateTypeError extends DomainError {
  readonly code = 'INVALID_TEMPLATE_TYPE';
  override readonly httpStatus = 400;

  constructor(value: string) {
    super(`Tipo de plantilla inválido: "${value}". Revisa el tipo indicado.`);
  }
}
