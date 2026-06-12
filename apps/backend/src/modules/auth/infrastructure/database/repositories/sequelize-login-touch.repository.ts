import { Injectable } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  ILoginTouchRepository,
  LoginTouchSubscription,
  LoginTouchPlanConfig,
} from '../../../domain/repositories/login-touch.repository';

interface RawSubscriptionRow {
  id: string;
  doctor_id: string;
  status: string;
  current_period_end: Date;
  plan: string;
}

interface RawPlanConfigRow {
  plan_key: string;
  is_permanent: boolean;
}

/**
 * Sequelize implementation of ILoginTouchRepository.
 *
 * Uses raw SQL queries exclusively — avoids any model class registration so
 * there is zero risk of Sequelize registry collisions with AdminModule or
 * DoctorSettingsModule models that map to the same tables.
 *
 * The Sequelize instance is injected globally (registered in AppModule via
 * SequelizeModule.forRootAsync) — NOT added to providers[] in AuthModule.
 */
@Injectable()
export class SequelizeLoginTouchRepository implements ILoginTouchRepository {
  constructor(private readonly sequelize: Sequelize) {}

  async findSubscriptionByDoctorId(doctorId: string): Promise<LoginTouchSubscription | null> {
    const rows = await this.sequelize.query<RawSubscriptionRow>(
      `SELECT id, doctor_id, status, current_period_end, plan
         FROM subscriptions
        WHERE doctor_id = :doctorId
        ORDER BY created_at DESC
        LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      doctorId: row.doctor_id,
      status: row.status,
      currentPeriodEnd: new Date(row.current_period_end),
      plan: row.plan,
    };
  }

  async findPlanConfigByKey(planKey: string): Promise<LoginTouchPlanConfig | null> {
    const rows = await this.sequelize.query<RawPlanConfigRow>(
      `SELECT plan_key, is_permanent
         FROM plan_configs
        WHERE plan_key = :planKey
        LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { planKey },
      },
    );

    const row = rows[0];
    if (!row) return null;

    return {
      planKey: row.plan_key,
      isPermanent: row.is_permanent,
    };
  }

  async persistDowngradeAndTouch(profileId: string, doctorId: string): Promise<void> {
    const t = await this.sequelize.transaction();
    try {
      // 1. Update last_sign_in_at on the profile.
      await this.sequelize.query(
        `UPDATE profiles
            SET last_sign_in_at = NOW(), updated_at = NOW()
          WHERE id = :profileId`,
        { replacements: { profileId }, type: QueryTypes.UPDATE, transaction: t },
      );

      // 2. Flip subscriptions.status to past_due.
      await this.sequelize.query(
        `UPDATE subscriptions
            SET status = 'past_due', updated_at = NOW()
          WHERE doctor_id = :doctorId
            AND status IN ('active', 'trial', 'trialing')`,
        { replacements: { doctorId }, type: QueryTypes.UPDATE, transaction: t },
      );

      // 3. Sync the profiles snapshot.
      await this.sequelize.query(
        `UPDATE profiles
            SET subscription_status = 'past_due', updated_at = NOW()
          WHERE id = :doctorId`,
        { replacements: { doctorId }, type: QueryTypes.UPDATE, transaction: t },
      );

      // 4. Append an immutable audit entry.
      await this.sequelize.query(
        `INSERT INTO subscription_changes_log
           (id, doctor_id, action, actor_id, actor_role, reason, metadata, created_at)
         VALUES
           (uuid_generate_v4(), :doctorId, 'login_touch_expired', :doctorId,
            'system', 'Subscription expired — lazy downgrade on login', '{}', NOW())`,
        { replacements: { doctorId }, type: QueryTypes.INSERT, transaction: t },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async touchLastSignInAt(profileId: string): Promise<void> {
    await this.sequelize.query(
      `UPDATE profiles
          SET last_sign_in_at = NOW(), updated_at = NOW()
        WHERE id = :profileId`,
      { replacements: { profileId }, type: QueryTypes.UPDATE },
    );
  }
}
