import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `email_send_log` table.
 *
 * SECURITY:
 *   - NO column ever holds an email address or any other PII.
 *   - recipient_id is a logical UUID reference to a patient/doctor record in
 *     its own table. There is NO FK constraint (polymorphic reference) so
 *     deletions of patient/doctor records are not blocked by this table.
 *
 * NOTE: Registered via SequelizeModule.forFeature in EmailModule.
 * NEVER add to global AppModule models.
 */
@Table({
  tableName: 'email_send_log',
  timestamps: false,
  underscored: true,
})
export class EmailSendLogModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  /**
   * Logical type of the recipient: 'patient' | 'doctor' | 'admin' | 'system'.
   * Never stores the actual email address.
   */
  @Column({ type: DataType.STRING, allowNull: false, field: 'recipient_type' })
  declare recipientType: string;

  /**
   * UUID of the patient/doctor in their own table. Nullable for admin broadcasts
   * (multiple recipients with no single id) or 'system' sends.
   * NO foreign key constraint — soft logical reference.
   */
  @Column({ type: DataType.UUID, allowNull: true, field: 'recipient_id' })
  declare recipientId: string | null;

  @Column({ type: DataType.STRING, allowNull: false, field: 'template_name' })
  declare templateName: string;

  /** 'sent' | 'failed' */
  @Column({ type: DataType.STRING, allowNull: false })
  declare status: string;

  /** Active email driver at time of send: 'resend' | 'noop' | 'sandbox'. */
  @Column({ type: DataType.STRING, allowNull: true })
  declare provider: string | null;

  /**
   * Provider-assigned message ID (Resend `id` field) on success.
   * Null on failure or when using the noop adapter.
   */
  @Column({ type: DataType.STRING, allowNull: true, field: 'provider_message_id' })
  declare providerMessageId: string | null;

  /**
   * Truncated error message on failure (max 1 000 chars, enforced in domain).
   * Null on success.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'error_detail' })
  declare errorDetail: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
