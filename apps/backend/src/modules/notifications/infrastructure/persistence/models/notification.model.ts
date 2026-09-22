import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `notifications` table.
 *
 * No encryption: notification content (title, body) must NOT contain PII.
 * Quotes are referenced by their number (e.g. PRE-0001), never by patient
 * name, cedula, or any PHI. This is enforced in the use cases that create
 * notifications — this model does not validate that constraint.
 *
 * timestamps: false — the table has created_at but no updated_at.
 * Sequelize's timestamps:true would try to manage both.
 */
@Table({
  tableName: 'notifications',
  timestamps: false,
  underscored: true,
})
export class NotificationModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare type: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare body: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'entity_type' })
  declare entityType: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'entity_id' })
  declare entityId: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'read_at' })
  declare readAt: Date | null;

  /**
   * NO lleva `@CreatedAt`: ese decorador solo actúa con `timestamps: true`, y
   * acá están apagados porque la tabla no tiene `updated_at`. Tenerlo puesto
   * hacía creer que Sequelize rellenaba el valor solo — y no lo hacía, así que
   * la validación de allowNull fallaba antes de llegar a Postgres.
   * Lo setea el repositorio con el valor de la entidad.
   */
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
