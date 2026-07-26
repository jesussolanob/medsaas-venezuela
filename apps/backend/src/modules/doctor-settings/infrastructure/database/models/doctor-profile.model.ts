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
 * Sequelize model for the `profiles` table (T-01 in spec 03b-schema-real.md).
 *
 * Used by DoctorSettingsModule — includes payment_details (owner-only field).
 * This is the full-access read/write model for the authenticated doctor's own profile.
 * The BookingModule uses its own read-only ProfileModel that intentionally omits payment_details.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class DoctorProfileModel extends Model {
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

  @Column({ type: DataType.TEXT, allowNull: true, field: 'professional_title' })
  declare professionalTitle: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'clinic_id' })
  declare clinicId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'clinic_role' })
  declare clinicRole: string | null;

  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true, field: 'payment_methods' })
  declare paymentMethods: string[] | null;

  // payment_details is included here — this model is for the owner's own profile.
  // Never expose this field in public or list responses.
  @Column({ type: DataType.JSONB, allowNull: true, field: 'payment_details' })
  declare paymentDetails: Record<string, unknown> | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'avatar_url' })
  declare avatarUrl: string | null;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'allows_online' })
  declare allowsOnline: boolean | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'office_address' })
  declare officeAddress: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare city: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'subscription_status' })
  declare subscriptionStatus: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'logo_url' })
  declare logoUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'signature_url' })
  declare signatureUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'license_number' })
  declare licenseNumber: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'phone' })
  declare phone: string | null;

  @Default('usd_bcv')
  @Column({ type: DataType.TEXT, allowNull: true, field: 'currency_mode' })
  declare currencyMode: string | null;

  @Column({ type: DataType.DECIMAL(12, 4), allowNull: true, field: 'custom_rate' })
  declare customRate: number | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'custom_rate_label' })
  declare customRateLabel: string | null;

  /**
   * National ID (cedula). Already present in the profiles table.
   * Read-only after onboarding — never written via PUT /doctor/profile.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'cedula' })
  declare cedula: string | null;

  /**
   * Date of birth. New column added in migration 20260617000001.
   * DATEONLY → Sequelize returns a 'YYYY-MM-DD' string (not a JS Date),
   * which matches the DoctorProfile entity contract (string | null).
   */
  @Column({ type: DataType.DATEONLY, allowNull: true, field: 'birth_date' })
  declare birthDate: string | null;

  @Column({ type: DataType.STRING(1), allowNull: true, field: 'gender' })
  declare gender: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'welcome_dismissed_at' })
  declare welcomeDismissedAt: Date | null;

  /**
   * Explicit onboarding completion flag. Added in migration 20260617000004.
   * Set to true by CompleteRegistrationUseCase when the doctor submits the
   * onboarding form. DEFAULT false — never derived from specialty.
   */
  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'onboarding_completed' })
  declare onboardingCompleted: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'is_active' })
  declare isActive: boolean | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
