import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
  Unique,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `patient_identities` table.
 *
 * This table holds ONE row per unique cedula across the entire platform.
 * It is an internal master table — not exposed via any HTTP endpoint.
 *
 * cedula_hash     — deterministic HMAC-SHA256 hex (same algorithm + secret
 *                   as patients.cedula_search_hash; values are directly
 *                   comparable between tables).
 * cedula_encrypted — AES-256-GCM ciphertext stored for compliance/recovery.
 *                    Decryption is out of scope for Phase 3.
 */
@Table({
  tableName: 'patient_identities',
  timestamps: true,
  underscored: true,
})
export class PatientIdentityModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @Column({ type: DataType.TEXT, allowNull: false, field: 'cedula_hash' })
  declare cedulaHash: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'cedula_encrypted' })
  declare cedulaEncrypted: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
