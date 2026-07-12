import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
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
 * free_trial is the 30-day onboarding trial assigned on first registration.
 * After 30 days, the lazy-downgrade on login (ProcessLoginTouchUseCase) flips
 * subscriptions.status to 'past_due', which causes the features and panel
 * resolvers to fall back to delta_free (the permanent free plan).
 *
 * The trial plan is NOT public (excluded from the catalog by plan_key filter).
 */
const DOCTOR_INITIAL_PLAN: SubscriptionPlan = 'free_trial';
const DOCTOR_INITIAL_STATUS: SubscriptionStatus = 'trialing';

/** Trial duration in days for new doctor registrations. */
const TRIAL_DURATION_DAYS = 30;

/**
 * Returns a Date `days` after `from`.
 * Used to set current_period_end for the free_trial subscription.
 */
function trialPeriodEnd(from: Date, days: number): Date {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return end;
}

/**
 * Sequelize implementation of IIdentityRepository.
 *
 * Doctor registration is atomic — profile + subscription are created in a single
 * transaction so a doctor is never left without their subscription row.
 *
 * Email lookups are case-insensitive via ILIKE (Postgres).
 * The email column already has a unique index (idx_profiles_email) from
 * the initial schema migration — no duplicate insert risk.
 */
@Injectable()
export class SequelizeIdentityRepository implements IIdentityRepository {
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
   * Creates a doctor profile + subscription row atomically.
   *
   * - profile.plan and profile.subscription_status are set to delta_free/active
   *   so the profiles snapshot is consistent with the subscriptions table from day one.
   * - subscriptions row is created via findOrCreate (doctor_id UNIQUE) so the
   *   concurrent first-login race cannot produce duplicate subscription rows.
   * - On UniqueConstraintError (Postgres aborts the transaction), we rollback,
   *   read back the winner's profile, and defensively ensure the subscription
   *   exists (findOrCreate outside the transaction).
   */
  private async createDoctorWithSubscription(data: IdentityCreateData): Promise<Identity> {
    const t = await this.sequelize.transaction();

    try {
      const row = await this.model.create(
        {
          id: data.id,
          fullName: data.fullName,
          email: data.email,
          role: data.role,
          auth0Sub: data.auth0Sub,
          isActive: true,
          plan: DOCTOR_INITIAL_PLAN,
          subscriptionStatus: DOCTOR_INITIAL_STATUS,
        },
        { transaction: t },
      );

      const now = new Date();
      const periodEnd = trialPeriodEnd(now, TRIAL_DURATION_DAYS);
      await this.subscriptionModel.findOrCreate({
        where: { doctorId: row.id },
        defaults: {
          doctorId: row.id,
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
        transaction: t,
      });

      await t.commit();
      return this.toDomain(row);
    } catch (err) {
      await t.rollback();

      if (err instanceof UniqueConstraintError) {
        // Race: another concurrent request won the profile creation.
        // Read back what the winner wrote.
        const existing = await this.model.findOne({
          where: { email: { [Op.iLike]: data.email } },
        });
        if (existing) {
          // Defensive: the winner should have created the subscription too, but
          // guard here in case it crashed after the profile INSERT and before the
          // subscription findOrCreate. doctor_id UNIQUE prevents duplicates.
          const now = new Date();
          const periodEnd = trialPeriodEnd(now, TRIAL_DURATION_DAYS);
          await this.subscriptionModel.findOrCreate({
            where: { doctorId: existing.id },
            defaults: {
              doctorId: existing.id,
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
          return this.toDomain(existing);
        }
      }

      throw err;
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
