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
import type { PackageStatus } from '../../../domain/entities/patient-package.entity';

/**
 * Sequelize model for the `patient_packages` table (T-10 in spec 03b-schema-real.md).
 *
 * Session consumption with optimistic lock is performed via raw SQL in the
 * repository — not via Sequelize instance methods — to avoid race conditions.
 */
@Table({
  tableName: 'patient_packages',
  timestamps: true,
  underscored: true,
})
export class PatientPackageModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'patient_id' })
  declare patientId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'auth_user_id' })
  declare authUserId: string | null;

  /**
   * FK to package_templates (added in v25). Kept nullable — no FK enforcement
   * in the Sequelize model because package_templates is out of the current scope.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'package_template_id' })
  declare packageTemplateId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'plan_name' })
  declare planName: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare specialty: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, field: 'total_sessions' })
  declare totalSessions: number;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'used_sessions' })
  declare usedSessions: number;

  @Default('active')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: PackageStatus;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'purchased_amount_usd' })
  declare purchasedAmountUsd: number | null;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'notified_one_left' })
  declare notifiedOneLeft: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
