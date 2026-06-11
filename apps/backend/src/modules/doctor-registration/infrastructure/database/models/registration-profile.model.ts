import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `profiles` table — scoped to the doctor-registration module.
 *
 * Only the columns required for registration and verification are declared.
 * The full DoctorProfileModel lives in doctor-settings and remains the
 * authoritative model for that module.
 *
 * NOTE: No @BelongsTo / @HasMany associations to avoid circular
 * SequelizeModule.forFeature() registration conflicts.
 */
@Table({
  tableName: 'profiles',
  timestamps: true,
  underscored: true,
})
export class RegistrationProfileModel extends Model {
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
  declare cedula: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'mpps_number' })
  declare mppsNumber: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'colegiado_number' })
  declare colegiadoNumber: string | null;

  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'verification_status' })
  declare verificationStatus: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'verified_at' })
  declare verifiedAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'verified_by' })
  declare verifiedBy: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'updated_at' })
  declare updatedAt: Date;
}
