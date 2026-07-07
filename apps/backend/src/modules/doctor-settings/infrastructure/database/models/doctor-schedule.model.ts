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
 * Sequelize model for the `doctor_schedules` table.
 *
 * Stores the weekly schedule configuration per doctor.
 * doctor_id is both the PK and a UNIQUE FK to profiles(id).
 * Created by migration: 20260602000005-doctor-schedules.cjs
 */
@Table({
  tableName: 'doctor_schedules',
  timestamps: true,
  underscored: true,
})
export class DoctorScheduleModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Default([1, 2, 3, 4, 5])
  @Column({ type: DataType.ARRAY(DataType.INTEGER), allowNull: false, field: 'work_days' })
  declare workDays: number[];

  @Default('08:00')
  @Column({ type: DataType.STRING(5), allowNull: false, field: 'start_time' })
  declare startTime: string;

  @Default('17:00')
  @Column({ type: DataType.STRING(5), allowNull: false, field: 'end_time' })
  declare endTime: string;

  @Default(30)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'slot_duration_minutes' })
  declare slotDurationMinutes: number;

  @Column({ type: DataType.STRING(5), allowNull: true, field: 'break_start' })
  declare breakStart: string | null;

  @Column({ type: DataType.STRING(5), allowNull: true, field: 'break_end' })
  declare breakEnd: string | null;

  @Default(8)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'booking_horizon_weeks' })
  declare bookingHorizonWeeks: number;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'booking_require_reason' })
  declare bookingRequireReason: boolean;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'booking_min_lead_days' })
  declare bookingMinLeadDays: number;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
