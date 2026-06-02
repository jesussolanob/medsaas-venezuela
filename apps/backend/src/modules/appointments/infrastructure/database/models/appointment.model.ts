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
import type { AppointmentStatus, AppointmentMode } from '@delta/shared-types';

/**
 * Sequelize model for the `appointments` table (T-06 in spec 03b-schema-real.md).
 *
 * The `appointment_status` column is a Postgres enum; DataType.TEXT + validation
 * at the application layer is used here to avoid sequelize-typescript enum type
 * complexity — the DB constraint enforces correctness at the storage level.
 *
 * patient_id is nullable (ON DELETE SET NULL): anonymous bookings are allowed.
 */
@Table({
  tableName: 'appointments',
  timestamps: true,
  underscored: true,
})
export class AppointmentModel extends Model {
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

  @Column({ type: DataType.UUID, allowNull: true, field: 'consultation_id' })
  declare consultationId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'patient_name' })
  declare patientName: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'patient_phone' })
  declare patientPhone: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'patient_email' })
  declare patientEmail: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'patient_cedula' })
  declare patientCedula: string | null;

  @Column({ type: DataType.DATE, allowNull: false, field: 'scheduled_at' })
  declare scheduledAt: Date;

  // appointment_status Postgres enum — stored as TEXT, DB constraint enforces values
  @Default('scheduled')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: AppointmentStatus;

  @Default('presencial')
  @Column({ type: DataType.TEXT, allowNull: true, field: 'appointment_mode' })
  declare appointmentMode: AppointmentMode;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare source: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'plan_name' })
  declare planName: string | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'plan_price' })
  declare planPrice: number | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_method' })
  declare paymentMethod: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_reference' })
  declare paymentReference: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'payment_receipt_url' })
  declare paymentReceiptUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'insurance_name' })
  declare insuranceName: string | null;

  @Column({ type: DataType.DECIMAL(10, 4), allowNull: true, field: 'bcv_rate' })
  declare bcvRate: number | null;

  @Column({ type: DataType.DECIMAL(12, 2), allowNull: true, field: 'amount_bs' })
  declare amountBs: number | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'package_id' })
  declare packageId: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true, field: 'session_number' })
  declare sessionNumber: number | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'chief_complaint' })
  declare chiefComplaint: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'appointment_code' })
  declare appointmentCode: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
