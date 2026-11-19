import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  AllowNull,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `doctor_document_files` table.
 *
 * Represents a file in the doctor's "Documentos frecuentes" library.
 * deleted_at is nullable (soft delete) — storage objects are never deleted
 * because past share links may still reference them.
 */
@Table({
  tableName: 'doctor_document_files',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  paranoid: true,
  deletedAt: 'deleted_at',
})
export class DoctorDocumentFileModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'storage_path' })
  declare storagePath: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'mime_type' })
  declare mimeType: string;

  @Column({ type: DataType.INTEGER, allowNull: false, field: 'size_bytes' })
  declare sizeBytes: number;

  @CreatedAt
  @Column({ field: 'created_at', defaultValue: DataType.NOW })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at', defaultValue: DataType.NOW })
  declare updatedAt: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE, field: 'deleted_at' })
  declare deletedAt: Date | null;
}
