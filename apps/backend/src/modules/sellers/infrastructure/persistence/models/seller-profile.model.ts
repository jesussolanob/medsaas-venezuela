import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `profiles` table scoped to sellers module.
 *
 * Declares only the columns needed by seller use cases. The full profile model
 * lives in each module that needs it (no shared global profile model to avoid
 * circular dependencies).
 *
 * NOTE: no @BelongsTo / @HasOne associations — avoids circular
 * SequelizeModule.forFeature() conflicts between modules.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class SellerProfileModel extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare email: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare role: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare specialty: string | null;

  /**
   * Datos de la ficha que el vendedor consulta de sus especialistas.
   *
   * Las columnas ya existían en `profiles`; este modelo no las declaraba, así
   * que el portal no podía mostrarlas. Son datos del ESPECIALISTA (no de
   * pacientes) y el vendedor es personal de Delta, pero igual: nunca se loguean.
   */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare phone: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare cedula: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean | null;

  /** The plan snapshot column — only populated for doctor/specialist profiles. */
  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'subscription_status' })
  declare subscriptionStatus: string | null;

  /**
   * Short alphanumeric code that the seller shares with prospects.
   * Only set on profiles with role = 'seller'. NULL for all other roles.
   * Added by migration 20260816000001-seller-role.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'seller_code' })
  declare sellerCode: string | null;

  /**
   * FK to the seller who onboarded this specialist.
   * NULL = not attributed to any seller.
   * Written exactly once — never overwritten after the first attribution.
   * Added by migration 20260816000001-seller-role.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'sold_by' })
  declare soldBy: string | null;

  /**
   * How the attribution in `sold_by` happened:
   *   'code'  = the specialist typed a seller code during self-onboarding.
   *   'admin' = a super_admin assigned the specialist to a seller by hand.
   *   NULL    = not attributed to any seller.
   *
   * TEXT, not a Postgres ENUM: this project has had two production outages from
   * ENUM values present in code but missing from the DB.
   *
   * IMPORTANT: this must be written together with `sold_by`. The signup commission
   * only pays for the 'code' path, so leaving it NULL silently kills the payout.
   * Added by migration 20260828000001-seller-commissions.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'sold_by_source' })
  declare soldBySource: string | null;

  /**
   * Timestamp of the seller's or specialist's last authenticated session.
   * Updated by the identity-resolver on every login. NULL = never logged in.
   */
  @Column({ type: DataType.DATE, allowNull: true, field: 'last_sign_in_at' })
  declare lastSignInAt: Date | null;

  /**
   * Whether the specialist has completed the onboarding wizard (has an active
   * office + service). Column added by migration 20260617000004. NULL on legacy
   * rows that predate the column — treated as false in the mapper.
   */
  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'onboarding_completed' })
  declare onboardingCompleted: boolean | null;

  /**
   * Payment configuration for this seller: how Delta pays them their commissions.
   * Stored as JSONB — same column and shape used by specialist profiles (ADR-044).
   * NULL on rows that have never set payment details.
   *
   * SECURITY: financial data — never log.
   */
  @Column({ type: DataType.JSONB, allowNull: true, field: 'payment_details' })
  declare paymentDetails: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
