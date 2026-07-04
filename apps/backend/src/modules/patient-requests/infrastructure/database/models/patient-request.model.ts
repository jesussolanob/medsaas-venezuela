import {
  AllowNull,
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `patient_requests` table.
 *
 * Stores doctor-initiated requests to patients for documents or responses.
 * The token is a long random URL-safe string (not a UUID) to make enumeration
 * infeasible.
 *
 * No UpdatedAt — write-once fields; status/response updates via raw SQL.
 */
@Table({
  tableName: 'patient_requests',
  timestamps: false,
})
export class PatientRequestModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  /** Long URL-safe random token. UNIQUE per DB constraint. */
  @Column({ type: DataType.TEXT, allowNull: false, unique: true })
  declare token: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare title: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare description: string | null;

  /** Patient's optional free-text response when submitting. */
  @AllowNull(true)
  @Column({ type: DataType.TEXT, field: 'response_text' })
  declare responseText: string | null;

  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  /**
   * Request-level brute-force counter. Accumulates across all code rotations.
   * Requesting a new code does NOT reset this counter.
   */
  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'failed_attempts' })
  declare failedAttempts: number;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: 'last_code_requested_at' })
  declare lastCodeRequestedAt: Date | null;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: 'fulfilled_at' })
  declare fulfilledAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
