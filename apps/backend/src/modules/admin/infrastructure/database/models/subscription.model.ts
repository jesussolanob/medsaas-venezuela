import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

/**
 * Admin-module Sequelize model for the `subscriptions` table (T-04 in spec 03b-schema-real.md).
 *
 * CLASS NAME: AdminSubscriptionModel (not SubscriptionModel) to avoid a registry
 * collision with DoctorSettingsModule's SubscriptionModel. Sequelize-typescript
 * registers models by class name in a global map; two classes with the same name
 * mapping to the same table would silently overwrite each other.
 *
 * plan / status are Postgres enums; DataType.TEXT is used here — the DB enum
 * constraint enforces valid values at the storage level.
 */
@Table({
  tableName: 'subscriptions',
  timestamps: true,
  underscored: true,
})
export class AdminSubscriptionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Default('trial')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare plan: SubscriptionPlan;

  @Default('trial')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: SubscriptionStatus;

  @Default(0)
  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'price_usd' })
  declare priceUsd: number;

  @Default('monthly')
  @Column({ type: DataType.TEXT, allowNull: true, field: 'billing_cycle' })
  declare billingCycle: string | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'current_period_start' })
  declare currentPeriodStart: Date;

  @Column({ type: DataType.DATE, allowNull: false, field: 'current_period_end' })
  declare currentPeriodEnd: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'trial_ends_at' })
  declare trialEndsAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'cancelled_at' })
  declare cancelledAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
