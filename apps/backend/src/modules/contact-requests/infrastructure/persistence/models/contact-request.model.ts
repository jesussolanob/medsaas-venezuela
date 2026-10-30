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
 * Sequelize model for the `contact_requests` table.
 *
 * No PII encryption: contact_requests does not contain cedula/diagnosis/treatment.
 * Phone/email are accessed from the joined profiles row in admin queries — they
 * live in profiles (encrypted there) and are NOT duplicated here.
 *
 * IMPORTANT: NEVER register Sequelize in providers — it is provided globally
 * via SequelizeModule.forRootAsync in AppModule.
 */
@Table({
  tableName: 'contact_requests',
  timestamps: true,
  underscored: true,
})
export class ContactRequestModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare channel: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare message: string | null;

  @Column({ type: DataType.TEXT, allowNull: false, defaultValue: 'pending' })
  declare status: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'handled_by' })
  declare handledBy: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'handled_at' })
  declare handledAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'notification_count',
  })
  declare notificationCount: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_notified_at' })
  declare lastNotifiedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
