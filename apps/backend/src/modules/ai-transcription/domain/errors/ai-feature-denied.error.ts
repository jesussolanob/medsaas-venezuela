import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the doctor's current plan does not include the requested AI text feature,
 * or when the plan gate cannot be verified (fail-closed behavior).
 *
 * HTTP 403 — Forbidden.
 */
export class AiFeatureDeniedError extends DomainError {
  readonly code = 'AI_FEATURE_DENIED';
  override readonly httpStatus = 403;

  constructor(reason: 'plan_not_included' | 'plan_check_failed') {
    const message =
      reason === 'plan_check_failed'
        ? 'No se pudo verificar el plan. Acceso denegado por seguridad.'
        : 'Tu plan no incluye esta función de IA. Actualiza a Delta Plus.';
    super(message);
  }
}
