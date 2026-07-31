import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as Sentry from '@sentry/nestjs';
import { Identity } from '../../../domain/entities/identity.entity';
import type {
  IIdentityRepository,
  IdentityCreateData,
} from '../../../domain/repositories/identity.repository';
import { AuthProfileModel } from '../models/auth-profile.model';
import { AdminSubscriptionModel } from '../../../../admin/infrastructure/database/models/subscription.model';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

/**
 * Plan and status assigned to every new doctor at registration.
 *
 * free_trial is the onboarding trial assigned on first registration. Its
 * duration is configurable via plan_configs.trial_days (plan_key = 'free_trial').
 * After the trial, the lazy-downgrade on login (ProcessLoginTouchUseCase) flips
 * subscriptions.status to 'past_due', which causes the features and panel
 * resolvers to fall back to delta_free (the permanent free plan).
 *
 * The trial plan is NOT public (excluded from the catalog by plan_key filter).
 */
const DOCTOR_INITIAL_PLAN: SubscriptionPlan = 'free_trial';
const DOCTOR_INITIAL_STATUS: SubscriptionStatus = 'trialing';

/**
 * Fallback trial duration (days) used when plan_configs.trial_days cannot be
 * read (missing row, null value, invalid value, or query error).
 * The authoritative value lives in plan_configs WHERE plan_key = 'free_trial'.
 */
const DEFAULT_TRIAL_DURATION_DAYS = 30;

/**
 * Returns a Date exactly `days` × 24 h after `from` using millisecond arithmetic.
 *
 * setDate() operates in local wall-clock time and can produce unexpected results
 * around DST transitions (±1 h).  Millisecond arithmetic is timezone-agnostic
 * and ensures the trial window is precisely the requested number of 24-hour periods.
 */
function trialPeriodEnd(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Sequelize implementation of IIdentityRepository.
 *
 * Doctor registration prioritises keeping the doctor over transaction atomicity.
 * The profiles row sets plan + subscription_status (the fields read by the
 * features resolver) so a doctor is fully functional even when the subscriptions
 * bookkeeping row is absent — as confirmed by demo.google@deltasalud.app in prod.
 *
 * Registration flow:
 *   1. Insert profiles row — committed immediately (no wrapping transaction).
 *      UniqueConstraintError = concurrent first-login race; read back the winner.
 *   2. Insert/find subscriptions row best-effort, AFTER the profile is committed.
 *      If this step fails the profile already exists; the doctor can log in and
 *      use the app. The failure is logged ([signup] prefix) and reported to Sentry
 *      for manual follow-up, but never propagated to the caller.
 *
 * Email lookups are case-insensitive via ILIKE (Postgres).
 * The email column already has a unique index (idx_profiles_email) from
 * the initial schema migration — no duplicate insert risk.
 */
@Injectable()
export class SequelizeIdentityRepository implements IIdentityRepository {
  private readonly logger = new Logger(SequelizeIdentityRepository.name);

  constructor(
    @InjectModel(AuthProfileModel)
    private readonly model: typeof AuthProfileModel,
    @InjectModel(AdminSubscriptionModel)
    private readonly subscriptionModel: typeof AdminSubscriptionModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findByEmail(email: string): Promise<Identity | null> {
    const row = await this.model.findOne({
      where: {
        email: { [Op.iLike]: email },
      },
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async create(data: IdentityCreateData): Promise<Identity> {
    if (data.role !== 'doctor') {
      return this.createProfileOnly(data);
    }
    return this.createDoctorWithSubscription(data);
  }

  async updateAuth0Sub(id: string, auth0Sub: string): Promise<void> {
    await this.model.update({ auth0Sub }, { where: { id } });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Reads the configured trial duration (in days) from plan_configs.
   *
   * Queries plan_configs WHERE plan_key = 'free_trial' AND is_active = true and
   * returns trial_days when it is a valid integer > 0.  Falls back to
   * DEFAULT_TRIAL_DURATION_DAYS in every error or invalid-value scenario so
   * that doctor registration never fails because of a missing config row.
   *
   * Executed BEFORE the profile INSERT to keep the write as short as possible.
   */
  private async resolveTrialDurationDays(): Promise<number> {
    try {
      const rows = await this.sequelize.query<{ trial_days: number | string | null }>(
        `SELECT trial_days
           FROM plan_configs
          WHERE plan_key = :planKey
            AND is_active = true
          LIMIT 1`,
        {
          replacements: { planKey: 'free_trial' },
          type: QueryTypes.SELECT,
        },
      );

      const raw = rows[0]?.trial_days;
      const parsed = Number(raw);

      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }

      return DEFAULT_TRIAL_DURATION_DAYS;
    } catch {
      return DEFAULT_TRIAL_DURATION_DAYS;
    }
  }

  /**
   * Creates a non-doctor profile only (no subscription needed for patients, etc.).
   * Preserves the original concurrent first-login race handling.
   */
  private async createProfileOnly(data: IdentityCreateData): Promise<Identity> {
    try {
      const row = await this.model.create({
        id: data.id,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        auth0Sub: data.auth0Sub,
        isActive: true,
      });
      return this.toDomain(row);
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        const existing = await this.model.findOne({
          where: { email: { [Op.iLike]: data.email } },
        });
        if (existing) {
          return this.toDomain(existing);
        }
      }
      throw err;
    }
  }

  /**
   * Creates a doctor profile, then creates the subscription row best-effort.
   *
   * Step 1 — profile INSERT (auto-committed, no transaction).
   *   profile.plan and profile.subscription_status are set so the features
   *   resolver works immediately regardless of whether step 2 succeeds.
   *   UniqueConstraintError = concurrent first-login race; read back the winner
   *   and ensure the subscription with tryCreateSubscription.
   *
   * Step 2 — subscription findOrCreate (best-effort, outside the profile write).
   *   If this throws, the profile already exists and the doctor can log in.
   *   The failure is logged with the [signup] prefix and reported to Sentry.
   */
  private async createDoctorWithSubscription(data: IdentityCreateData): Promise<Identity> {
    // Resolve trial duration before the INSERT to keep the write short.
    // Falls back to DEFAULT_TRIAL_DURATION_DAYS on any error.
    const trialDays = await this.resolveTrialDurationDays();

    // Step 1: insert profile standalone.
    let row: AuthProfileModel;
    try {
      row = await this.model.create({
        id: data.id,
        fullName: data.fullName,
        email: data.email,
        role: data.role,
        auth0Sub: data.auth0Sub,
        isActive: true,
        plan: DOCTOR_INITIAL_PLAN,
        subscriptionStatus: DOCTOR_INITIAL_STATUS,
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        // Race: another concurrent request already inserted this profile.
        // Read back the winner and ensure the subscription row exists.
        const existing = await this.model.findOne({
          where: { email: { [Op.iLike]: data.email } },
        });
        if (existing) {
          await this.tryCreateSubscription(existing.id, data.email, trialDays);
          return this.toDomain(existing);
        }
      }
      throw err;
    }

    // Step 2: create subscription best-effort — outside the profile INSERT.
    await this.tryCreateSubscription(row.id, data.email, trialDays);

    return this.toDomain(row);
  }

  /**
   * Attempts to create the subscriptions row for a doctor.
   *
   * Uses findOrCreate (doctor_id UNIQUE) so concurrent retries are idempotent.
   *
   * On failure: logs with the [signup] prefix (email + reason) and reports to
   * Sentry. Never propagates — the caller returns the profile regardless.
   */
  private async tryCreateSubscription(
    doctorId: string,
    email: string,
    trialDays: number,
  ): Promise<void> {
    try {
      const now = new Date();
      const periodEnd = trialPeriodEnd(now, trialDays);
      await this.subscriptionModel.findOrCreate({
        where: { doctorId },
        defaults: {
          doctorId,
          plan: DOCTOR_INITIAL_PLAN,
          status: DOCTOR_INITIAL_STATUS,
          priceUsd: 0,
          billingCycle: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: periodEnd,
          cancelledAt: null,
          notes: null,
        },
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      // Profile already committed — doctor exists. Log and report for follow-up.
      this.logger.error(`[signup] subscription-missing email="${email}" reason="${reason}"`);
      reportSubscriptionFailureToSentry(email, err);
    }
  }

  private toDomain(row: AuthProfileModel): Identity {
    return Identity.create({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      auth0Sub: row.auth0Sub ?? null,
      createdAt: row.createdAt,
    });
  }
}

/**
 * Reports a subscription creation failure to Sentry when SENTRY_ENABLED=true.
 *
 * Uses withScope so the user/tag context is scoped to this single event and
 * does not bleed into other concurrent requests.
 *
 * Never throws — all errors are swallowed so this can never affect the login flow.
 */
function reportSubscriptionFailureToSentry(email: string, err: unknown): void {
  if (process.env.SENTRY_ENABLED !== 'true') return;
  try {
    Sentry.withScope((scope) => {
      scope.setUser({ email });
      scope.setTag('signup_failure', 'true');
      scope.setExtra('signup_email', email);
      scope.captureException(err);
    });
  } catch {
    // Sentry itself errored — ignore silently.
  }
}
