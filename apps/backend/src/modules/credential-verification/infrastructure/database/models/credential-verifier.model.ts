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
 * Sequelize model for the `credential_verifiers` table.
 *
 * Each row describes one external portal and how to query it.
 * Scoped to the credential-verification module.
 */
@Table({
  tableName: 'credential_verifiers',
  timestamps: true,
  underscored: true,
})
export class CredentialVerifierModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'credential_type' })
  declare credentialType: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'profession_code' })
  declare professionCode: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare jurisdiction: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'portal_name' })
  declare portalName: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'portal_url' })
  declare portalUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare method: string;

  @Column({ type: DataType.JSONB, allowNull: true, field: 'request_template' })
  declare requestTemplate: Record<string, unknown> | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'required_input' })
  declare requiredInput: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'response_parser' })
  declare responseParser: string | null;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'has_captcha' })
  declare hasCaptcha: boolean;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'tls_insecure' })
  declare tlsInsecure: boolean;

  @Default('active')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_checked_at' })
  declare lastCheckedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
