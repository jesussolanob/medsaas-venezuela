import { DomainError } from '../../../../domain/errors/domain.error';
import type { QuoteStatus } from '../entities/quote.entity';

/**
 * Rótulos en español de cada estado.
 *
 * El mensaje interpolaba los valores CRUDOS del enum ('sent', 'accepted'), que
 * están en inglés. Ese texto lo reenvía el GlobalExceptionFilter tal cual al
 * usuario, y en la vista pública del presupuesto ese usuario es un PACIENTE:
 * leía "No se puede cambiar el estado de 'sent' a 'accepted'".
 *
 * No es un caso hipotético: pasa cuando alguien abre el presupuesto en dos
 * pestañas y responde en las dos, o reintenta después de que ya respondió.
 */
const ETIQUETAS: Record<QuoteStatus, string> = {
  draft: 'borrador',
  sent: 'enviado',
  accepted: 'aceptado',
  rejected: 'rechazado',
  expired: 'vencido',
};

/**
 * Se intentó una transición de estado que la entidad no permite.
 *
 * Solo un presupuesto ENVIADO puede pasar a aceptado, rechazado o vencido.
 */
export class QuoteInvalidStatusTransitionError extends DomainError {
  readonly code = 'QUOTE_INVALID_STATUS_TRANSITION';
  override readonly httpStatus = 422;

  constructor(currentStatus: QuoteStatus, targetStatus: QuoteStatus) {
    super(
      `Este presupuesto ya está ${ETIQUETAS[currentStatus]} y no se puede marcar como ` +
        `${ETIQUETAS[targetStatus]}. Solo se puede responder un presupuesto enviado.`,
    );
  }
}
