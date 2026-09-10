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

  /**
   * Qué se cambió: `'status'` (transición de estado, el caso histórico) o
   * `'service'` (corrección del servicio contratado, que mueve el monto del pago).
   * Agregada por 20260910000001; las filas viejas quedaron en `'status'`.
   */
  @Default('status')
  @Column({ type: DataType.STRING(20), allowNull: false, field: 'change_type' })
  declare changeType: string;

  @Column({ type: DataType.STRING(20), allowNull: true, field: 'old_status' })
  declare oldStatus: string | null;

  /** Null en los cambios que no son de estado — en un cambio de servicio el estado no se mueve. */
  @Column({ type: DataType.STRING(20), allowNull: true, field: 'new_status' })
  declare newStatus: string | null;

  /**
   * Valor anterior y nuevo para los cambios que no son de estado. En un cambio de
   * servicio guardan "nombre · $monto": sin esto la diferencia de dinero entre el
   * servicio viejo y el nuevo no dejaría ningún rastro.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'old_value' })
  declare oldValue: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'new_value' })
  declare newValue: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
