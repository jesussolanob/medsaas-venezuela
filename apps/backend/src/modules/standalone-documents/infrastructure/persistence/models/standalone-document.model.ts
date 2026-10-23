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
 * Sequelize model for the `standalone_documents` table.
 *
 * IMPORTANT:
 *   - Sequelize is NOT in module providers — it is global via AppModule.
 *   - Register only via SequelizeModule.forFeature([StandaloneDocumentModel]).
 *
 * DB constraints (enforced in migration 20261022000001):
 *   - type CHECK IN (recipe, paraclinical, reposo)
 *   - status CHECK IN (draft, issued, voided)
 *   - UNIQUE (doctor_id, code)
 *   - INDEX (doctor_id, created_at DESC)
 *   - INDEX (patient_id, created_at DESC)
 */
@Table({
  tableName: 'standalone_documents',
  timestamps: true,
  underscored: true,
})
export class StandaloneDocumentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'patient_id' })
  declare patientId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare type: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare code: string | null;

  @Default('draft')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare content: Record<string, unknown>;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'void_reason' })
  declare voidReason: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'issued_at' })
  declare issuedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'voided_at' })
  declare voidedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
