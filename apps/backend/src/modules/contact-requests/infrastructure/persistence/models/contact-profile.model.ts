import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Scoped Sequelize model for `profiles` — contact-requests module only.
 *
 * Declares only the columns needed to join doctor data and find super_admins.
 * No encryption helpers: the raw values are used for admin display only
 * (admin can see doctor PII per the spec). Phone and email are stored
 * in plain text on profiles (the encryption columns are separate encrypted_*
 * fields; the plain columns are used for display in admin).
 *
 * NOTE: Do NOT import this from other modules. Each module that needs
 * a scoped profiles model creates its own to avoid cross-module coupling.
 */
@Table({
  tableName: 'profiles',
  timestamps: false,
  underscored: true,
})
export class ContactProfileModel extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'full_name' })
  declare fullName: string | null;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare email: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare role: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare phone: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare specialty: string | null;
}
