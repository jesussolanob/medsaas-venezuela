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
 * Sequelize model for the `reminders_queue` table.
 *
 * In Etapa 1 this table is read-only from the API perspective. The queue
 * will be populated by the Fase 6 scheduler (WhatsApp/email integration).
 *
 * IMPORTANT:
 *   - Sequelize is provided globally via SequelizeModule.forRootAsync in AppModule.
 *     Only register this model via SequelizeModule.forFeature([RemindersQueueModel]).
 *   - Never add Sequelize to module providers directly — it causes dist boot crash.
 */
@Table({
  tableName: 'reminders_queue',
  timestamps: false,
  underscored: true,
})
export class RemindersQueueModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'appointment_id' })
  declare appointmentId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'patient_id' })
  declare patientId: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'offset_type' })
  declare offsetType: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'scheduled_for' })
  declare scheduledFor: Date;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare channel: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'message_body' })
  declare messageBody: string | null;

  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare attempts: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_attempt_at' })
  declare lastAttemptAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'sent_at' })
  declare sentAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'error_message' })
  declare errorMessage: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
