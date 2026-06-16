import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `ai_request_log` table.
 *
 * NEVER stores PHI: no audio bytes, no transcript, no patient data.
 * Only metadata for auditing and rate-limiting.
 */
@Table({
  tableName: 'ai_request_log',
  timestamps: false,
  underscored: true,
})
export class AiRequestLogModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  /** FK to profiles.id (the doctor). Stored as text to avoid circular Sequelize deps. */
  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  /** Feature key, e.g. 'transcription'. */
  @Column({ type: DataType.STRING(50), allowNull: false })
  declare feature: string;

  /** Outcome: 'success' | 'error' | 'denied'. */
  @Column({ type: DataType.STRING(20), allowNull: false })
  declare status: string;

  /** Size of the audio buffer in bytes. 0 when the request was denied before upload. */
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'audio_bytes' })
  declare audioBytes: number;

  /** Gemini model name, e.g. 'gemini-2.5-flash'. */
  @Column({ type: DataType.STRING(100), allowNull: false })
  declare model: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;
}
