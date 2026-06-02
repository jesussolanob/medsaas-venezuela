import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Sequelize model for `appointment_changes_log`.
 *
 * This is an append-only audit table. No UpdatedAt — entries are immutable.
 * Created by migration 20260602000001-appointment-changes-log.cjs.
 */
@Table({
  tableName: 'appointment_changes_log',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class AppointmentChangesLogModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'appointment_id' })
  declare appointmentId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'actor_id' })
  declare actorId: string;

  @Column({ type: DataType.STRING(20), allowNull: true, field: 'old_status' })
  declare oldStatus: string | null;

  @Column({ type: DataType.STRING(20), allowNull: false, field: 'new_status' })
  declare newStatus: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
