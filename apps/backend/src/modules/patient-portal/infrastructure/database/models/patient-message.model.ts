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
 * Sequelize model for the `patient_messages` table (T-13 in spec 03b-schema-real.md).
 *
 * PLAINTEXT STORAGE DECISION (security audit 2026-06-02):
 * The `body` column stores messages in plaintext. Messages may contain clinical
 * information (symptoms, questions to the doctor) and are PHI.
 *
 * Etapa 1 decision: keep plaintext. Rationale:
 *   - Threat model: full-DB access requires infrastructure compromise, which
 *     already affects all encrypted tables regardless.
 *   - Plaintext preserves future full-text search and notification use cases.
 *   - The API enforces that only the owning patient and their doctor can read
 *     these messages — no cross-patient leakage is possible at the API layer.
 *
 * TODO (Etapa 2): if full-text search is not required, encrypt `body` with
 * AES-256-GCM the same way prescriptions are encrypted. Requires a migration
 * and a `body_search_hash` column if keyword matching is needed later.
 *
 * Direction: 'patient_to_doctor' | 'doctor_to_patient'
 *
 * NOTE: this table has no updated_at per the real schema T-13.
 * Only created_at is present.
 */
@Table({
  tableName: 'patient_messages',
  timestamps: false,
  underscored: true,
})
export class PatientMessageModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare body: string;

  // 'patient_to_doctor' | 'doctor_to_patient'
  @Column({ type: DataType.TEXT, allowNull: false })
  declare direction: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'read_at' })
  declare readAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
