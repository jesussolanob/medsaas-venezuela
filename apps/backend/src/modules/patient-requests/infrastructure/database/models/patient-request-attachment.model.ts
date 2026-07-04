import {
  AllowNull,
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `patient_request_attachments` table.
 *
 * Stores metadata for patient-uploaded files.
 * The file_url column stores the STORAGE PATH (not a signed URL) — signed
 * URLs are generated on demand by GetPatientRequestUseCase.
 */
@Table({
  tableName: 'patient_request_attachments',
  timestamps: false,
})
export class PatientRequestAttachmentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'request_id' })
  declare requestId: string;

  /** Storage path (NOT a signed URL). e.g. patient-requests/<requestId>/<uuid>-<filename> */
  @Column({ type: DataType.TEXT, allowNull: false, field: 'file_url' })
  declare fileUrl: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'file_name' })
  declare fileName: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT, field: 'content_type' })
  declare contentType: string | null;

  @AllowNull(true)
  @Column({ type: DataType.INTEGER, field: 'size_bytes' })
  declare sizeBytes: number | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'uploaded_at' })
  declare uploadedAt: Date;
}
