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
import type { PendingConsultationStatus } from '@delta/shared-types';

/**
 * Sequelize model for the `pending_consultations` table.
 *
 * NOTE: Sequelize is NOT declared in providers — it is injected globally via
 * the root SequelizeModule and resolved automatically in the repository.
 */
@Table({
  tableName: 'pending_consultations',
  timestamps: true,
  underscored: true,
})
export class PendingConsultationModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'auth_user_id' })
  declare authUserId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'package_id' })
  declare packageId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'payment_id' })
  declare paymentId: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'plan_name' })
  declare planName: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'office_id' })
  declare officeId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'appointment_mode' })
  declare appointmentMode: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, field: 'session_number' })
  declare sessionNumber: number;

  @Default('pending_scheduling')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: PendingConsultationStatus;

  @Column({ type: DataType.DATE, allowNull: true, field: 'expires_at' })
  declare expiresAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'scheduled_appointment_id' })
  declare scheduledAppointmentId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'consultation_id' })
  declare consultationId: string | null;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'reminder_stage' })
  declare reminderStage: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_reminder_at' })
  declare lastReminderAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
