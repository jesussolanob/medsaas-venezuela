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
 * Sequelize model for the `shared_files` table.
 *
 * STORAGE DECISION (2026-07):
 *   `file_url` stores the **GCS object path** (e.g. "shared/doctor-id/1234-file.pdf"),
 *   NOT a signed URL. Signed URLs expire after 1 hour and must not be stored.
 *   The repository layer generates a fresh signed URL via IStoragePort.getSignedUrl()
 *   on every read before returning data to the application layer.
 *
 * PLAINTEXT DECISION:
 *   title, description are stored as plaintext. They may contain clinical
 *   intent but not PII. Encryption is deferred to Etapa 2 when the full
 *   E2EE threat model is defined for this feature.
 */
@Table({
  tableName: 'shared_files',
  timestamps: true,
  underscored: true,
})
export class SharedFileModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  /**
   * GCS object path. Null for text-only entries (instructions/comments with no attachment).
   * Frontend uploads file to /api/storage/upload → receives { path } → sends path here.
   */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'file_url' })
  declare filePath: string | null;

  @Column({ type: DataType.STRING(50), allowNull: true, field: 'file_type' })
  declare fileType: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true, field: 'file_size_bytes' })
  declare fileSizeBytes: number | null;

  /** 'instruction' | 'file' | 'recipe' | 'lab_result' | 'image' | 'other' | 'comment' */
  @Column({ type: DataType.STRING(50), allowNull: false })
  declare category: string;

  /** 'pending' | 'completed' | 'reviewed' */
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: 'pending' })
  declare status: string;

  /** 'doctor' | 'patient' */
  @Column({ type: DataType.STRING(20), allowNull: false, field: 'created_by' })
  declare createdBy: string;

  /** Self-referencing FK for threaded replies (nullable). */
  @Column({ type: DataType.UUID, allowNull: true, field: 'parent_task_id' })
  declare parentTaskId: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'read_by_doctor',
  })
  declare readByDoctor: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'read_by_patient',
  })
  declare readByPatient: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
