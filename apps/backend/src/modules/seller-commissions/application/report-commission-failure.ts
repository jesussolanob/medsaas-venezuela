import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

/**
 * Contexto mínimo para reconstruir a mano una comisión que no se pudo acreditar.
 * Solo UUIDs y claves de plan — NUNCA nombres, cédulas, correos ni teléfonos.
 */
export interface CommissionFailureContext {
  /** Camino que disparó la acreditación, p. ej. 'complete-onboarding'. */
  hook: string;
  specialistId: string;
  type: 'signup' | 'plan';
  planKey?: string | null;
}

/**
 * Escala una acreditación de comisión fallida.
 *
 * POR QUÉ NO ALCANZA UN logger.warn: los enganches son fire-and-forget a propósito
 * —una comisión que falla nunca debe bloquear el onboarding ni el cobro—, pero eso
 * significa que si la BD tiene un pico justo en ese instante, la comisión
 * simplemente NO EXISTE y nadie se entera. El vendedor cobra de menos en la próxima
 * liquidación y no hay forma de darse cuenta salvo auditando a mano.
 *
 * Va como `error` (no `warn`) y a Sentry con etiquetas, para que quede accionable:
 * con `specialistId` + `type` se reconstruye la fila que faltó.
 *
 * Nunca lanza: si Sentry falla, no puede tumbar el flujo que lo llamó.
 */
export function reportCommissionFailure(
  logger: Logger,
  ctx: CommissionFailureContext,
  err: unknown,
): void {
  const msg = err instanceof Error ? err.message : 'unknown error';

  logger.error(
    `[${ctx.hook}] no se pudo acreditar la comisión ${ctx.type} — ` +
      `specialistId=${ctx.specialistId} planKey=${ctx.planKey ?? 'n/a'}: ${msg}`,
  );

  if (process.env.SENTRY_ENABLED !== 'true') return;

  try {
    Sentry.withScope((scope) => {
      scope.setTag('commission_accrual_failed', 'true');
      scope.setTag('commission_type', ctx.type);
      scope.setTag('commission_hook', ctx.hook);
      scope.setExtra('specialist_id', ctx.specialistId);
      scope.setExtra('plan_key', ctx.planKey ?? null);
      scope.captureException(err);
    });
  } catch {
    // Sentry falló — se ignora en silencio, el logger.error ya dejó rastro.
  }
}
