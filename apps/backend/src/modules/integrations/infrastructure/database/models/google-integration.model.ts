import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Sequelize model for the `google_integrations` table.
 *
 * access_token_encrypted and refresh_token_encrypted contain AES-256-GCM
 * ciphertext produced by CryptoService. NEVER log these columns.
 *
 * One row per doctor (UNIQUE constraint on doctor_id).
 *
 * IMPORTANT: NEVER add Sequelize to module providers — it is provided globally.
 */
@Table({
  tableName: 'google_integrations',
  timestamps: false,
})
export class GoogleIntegrationModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'access_token_encrypted' })
  declare accessTokenEncrypted: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'refresh_token_encrypted' })
  declare refreshTokenEncrypted: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'token_expiry' })
  declare tokenExpiry: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare scope: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'google_email' })
  declare googleEmail: string | null;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'connected_at' })
  declare connectedAt: Date;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false, field: 'updated_at' })
  declare updatedAt: Date;
}
