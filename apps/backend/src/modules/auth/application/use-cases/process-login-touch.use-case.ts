import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  LOGIN_TOUCH_REPOSITORY,
  type ILoginTouchRepository,
} from '../../domain/repositories/login-touch.repository';

/** Statuses that indicate an active/billable subscription that may expire. */
const EXPIRABLE_STATUSES = new Set(['active', 'trial', 'trialing']);

/** Plan gratuito permanente al que vuelve una cuenta reactivada. */
const FREE_PLAN_KEY = 'delta_free';

export interface ProcessLoginTouchInput {
  profileId: string;
  /** When provided, the use case checks for subscription expiry (doctor flow). */
  role?: string;
}

export interface ProcessLoginTouchOutput {
  /** True when a subscription was found expired and downgraded to past_due. */
  downgraded: boolean;
  /** True cuando la cuenta estaba dada de baja por su dueño y se volvió a encender. */
  reactivated?: boolean;
}

/**
 * ProcessLoginTouchUseCase
 *
 * Executes a "login touch" on every successful authentication:
 *   1. Records profiles.last_sign_in_at = NOW().
 *   2. For doctors only: if the subscription has expired (current_period_end < now)
 *      and its status is active/trial/trialing, persists a lazy downgrade to
 *      'past_due' (subscriptions + profiles snapshot + subscription_changes_log).
 *
 * Permanent plans (plan_configs.is_permanent = true) are never downgraded.
 *
 * This is best-effort when called from resolve-identity — callers wrap in
 * try/catch so a failure here never breaks the login flow.
 */
@Injectable()
export class ProcessLoginTouchUseCase {
  private readonly logger = new Logger(ProcessLoginTouchUseCase.name);

  constructor(
    @Inject(LOGIN_TOUCH_REPOSITORY)
    private readonly loginTouchRepo: ILoginTouchRepository,
  ) {}

  async execute(input: ProcessLoginTouchInput): Promise<ProcessLoginTouchOutput> {
    const isDoctor = input.role === 'doctor';

    // Volver a entrar reactiva la cuenta que el propio especialista dio de baja:
    // queda en el plan gratuito, con todos sus datos intactos, y puede mejorar su
    // plan sin pedirle nada a un administrador. Un bloqueo hecho por un admin NO
    // se toca acá — ese sigue necesitando al admin.
    if (isDoctor) {
      const estado = await this.loginTouchRepo.findAccountState(input.profileId);
      if (estado && !estado.isActive && estado.deactivatedBy === 'self') {
        await this.loginTouchRepo.reactivateAsFreeAndTouch(input.profileId, FREE_PLAN_KEY);
        this.logger.log(
          'Login touch: cuenta dada de baja por su dueño reactivada en plan gratuito',
        );
        return { downgraded: false, reactivated: true };
      }
    }

    if (!isDoctor) {
      // Non-doctors: just record the sign-in time. No subscription logic.
      await this.loginTouchRepo.touchLastSignInAt(input.profileId);
      return { downgraded: false };
    }

    // For doctors: check subscription expiry before persisting.
    const subscription = await this.loginTouchRepo.findSubscriptionByDoctorId(input.profileId);

    if (!subscription) {
      // Doctor has no subscription row — just touch.
      await this.loginTouchRepo.touchLastSignInAt(input.profileId);
      return { downgraded: false };
    }

    const isExpirableStatus = EXPIRABLE_STATUSES.has(subscription.status);
    const now = new Date();
    const isExpired = subscription.currentPeriodEnd < now;

    if (!isExpirableStatus || !isExpired) {
      // Not expired or not in a downgrade-eligible status.
      await this.loginTouchRepo.touchLastSignInAt(input.profileId);
      return { downgraded: false };
    }

    // Check whether the plan is permanent (never expires).
    const planConfig = await this.loginTouchRepo.findPlanConfigByKey(subscription.plan);
    if (planConfig?.isPermanent) {
      // Permanent plans do not expire — do not downgrade.
      this.logger.log(
        `Login touch: permanent plan '${subscription.plan}' for doctor — skipping downgrade`,
      );
      await this.loginTouchRepo.touchLastSignInAt(input.profileId);
      return { downgraded: false };
    }

    // Persist downgrade atomically (last_sign_in_at + subscription status + log).
    await this.loginTouchRepo.persistDowngradeAndTouch(input.profileId, subscription.doctorId);
    this.logger.log(
      `Login touch: downgraded subscription ${subscription.id} to past_due for doctor ${input.profileId}`,
    );

    return { downgraded: true };
  }
}
