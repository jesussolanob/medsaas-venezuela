import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import type { PricingPlanType } from '../../../domain/entities/pricing-plan.entity';

/**
 * Sequelize model for the `pricing_plans` table (T-11 in spec 03b-schema-real.md).
 *
 * These are the doctor's service offerings (consultation plans/services), not to be
 * confused with plan_configs which are SaaS subscription plans.
 *
 * office_id (nullable FK → doctor_offices):
 *   null  = general plan, usable at all offices.
 *   non-null = plan is specific to the referenced office.
 *   Added by migration 20260611000009-office-id-on-pricing-plans-and-appointments.
 */
@Table({
  tableName: 'pricing_plans',
  timestamps: true,
  underscored: true,
})
export class PricingPlanModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  /**
   * FK → doctor_offices(id). Null = general plan (all offices).
   * ON DELETE SET NULL ensures plans survive office deletion.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'office_id' })
  declare officeId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: false, field: 'price_usd' })
  declare priceUsd: number;

  @Default(30)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'duration_minutes' })
  declare durationMinutes: number;

  @Default(1)
  @Column({ type: DataType.INTEGER, allowNull: true, field: 'sessions_count' })
  declare sessionsCount: number;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Default('plan')
  @Column({ type: DataType.TEXT, allowNull: true })
  declare type: PricingPlanType;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'show_in_booking' })
  declare showInBooking: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
