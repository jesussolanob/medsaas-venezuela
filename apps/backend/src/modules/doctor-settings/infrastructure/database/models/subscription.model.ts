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

/**
 * Read-only Sequelize model for the `subscriptions` table (T-04 in spec 03b-schema-real.md).
 *
 * DoctorSettingsModule only reads from this table to determine the subscription
 * state and banner level. Writes happen via admin or billing flows (out of scope).
 */
@Table({
  tableName: 'subscriptions',
  timestamps: true,
  underscored: true,
})
export class SubscriptionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare plan: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  // allowNull: true in the model so TypeScript reflects that runtime nulls are
  // possible (corrupted/trial rows), even though the DB schema says NOT NULL.
  // The repository guards with ?? null before passing to the domain VO.
  @Column({ type: DataType.DATE, allowNull: true, field: 'current_period_end' })
  declare currentPeriodEnd: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'trial_ends_at' })
  declare trialEndsAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'cancelled_at' })
  declare cancelledAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
