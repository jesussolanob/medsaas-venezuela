import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import { OnboardingRequirementsNotMetError } from '../../../domain/errors/onboarding-requirements-not-met.error';
import { AccrueSignupCommissionUseCase } from '../../../../seller-commissions/application/use-cases/accrue-signup-commission.use-case';
import { reportCommissionFailure } from '../../../../seller-commissions/application/report-commission-failure';

export interface CompleteOnboardingOutput {
  onboardingCompleted: boolean;
}

/**
 * Verifies that the doctor has the minimum requirements to complete onboarding
 * (≥1 active office AND ≥1 active service), then sets onboarding_completed_at.
 *
 * Idempotent: calling this multiple times is safe — if already completed, we
 * just update the timestamp (harmless). The UI should stop showing the gate
 * once onboardingCompleted = true.
 *
 * After marking onboarding complete, fires AccrueSignupCommissionUseCase in a
 * best-effort / fire-and-forget manner — a commission failure never blocks the
 * specialist from completing their onboarding.
 *
 * SECURITY: doctorId always comes from the authenticated token (anti-IDOR).
 */
@Injectable()
export class CompleteOnboardingUseCase {
  private readonly logger = new Logger(CompleteOnboardingUseCase.name);

  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
    // @Inject EXPLICITO: sin el token, Nest resuelve por el tipo reflejado y acá
    // no resolvía — el enganche llegaba nulo y, al ser @Optional(), en silencio.
    @Optional()
    @Inject(AccrueSignupCommissionUseCase)
    private readonly accrueSignupCommission: AccrueSignupCommissionUseCase | null = null,
  ) {
    // DIAGNÓSTICO DE CABLEO — se emite UNA vez, al construirse el use case.
    //
    // El enganche es @Optional() para que una comisión que falla no bloquee el
    // onboarding. El precio de eso es que si la dependencia NO se inyecta, no
    // pasa absolutamente nada: sin error, sin aviso, sin comisión. Ya ocurrió
    // —un especialista se dio de alta por código, la atribución quedó bien, y no
    // se acreditó nada ni quedó rastro— y desde afuera era indistinguible de un
    // problema de reglas de negocio.
    //
    // Este log convierte ese silencio en una señal visible al arrancar.
    if (this.accrueSignupCommission) {
      this.logger.log('[cableo] AccrueSignupCommissionUseCase inyectado OK');
    } else {
      this.logger.warn(
        '[cableo] AccrueSignupCommissionUseCase NO se inyectó — ' +
          'NINGUNA comisión de entrada se va a acreditar',
      );
    }
  }

  async execute(doctorId: string): Promise<CompleteOnboardingOutput> {
    // 1. Verify requirements in parallel — server-side validation cannot be bypassed.
    const [activeOffices, allPlans] = await Promise.all([
      this.officeRepo.findActiveByDoctor(doctorId),
      this.pricingPlanRepo.findAllByDoctorId(doctorId),
    ]);

    const hasActiveOffice = activeOffices.length > 0;
    const hasActiveService = allPlans.some((p) => p.isActive);

    if (!hasActiveOffice || !hasActiveService) {
      throw new OnboardingRequirementsNotMetError();
    }

    // 2. Mark onboarding as complete (idempotent).
    await this.profileRepo.markOnboardingCompleted(doctorId);

    // 3. Best-effort: accrue signup commission (does not affect the response on failure).
    if (this.accrueSignupCommission) {
      // Temporal: confirma que el camino se recorre de verdad. Sin esto, un
      // "no pasó nada" no distingue entre no haber llegado acá y haberse
      // salteado adentro del accrual.
      this.logger.log(`[cableo] disparando accrue-signup para doctorId=${doctorId}`);
      void this.accrueSignupCommission.execute(doctorId).catch((err: unknown) => {
        reportCommissionFailure(
          this.logger,
          { hook: 'complete-onboarding', specialistId: doctorId, type: 'signup' },
          err,
        );
      });
    }

    return { onboardingCompleted: true };
  }
}
