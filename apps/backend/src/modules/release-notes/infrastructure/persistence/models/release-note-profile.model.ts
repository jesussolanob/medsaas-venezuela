import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Scoped Sequelize model for `profiles` — release-notes module only.
 *
 * Declares only the columns needed:
 *   - plan: to filter notes by audiencePlans.
 *   - release_notes_seen_at: to compute unseen notes.
 *   - created_at: fallback when release_notes_seen_at is NULL.
 *   - full_name: for createdByName join in admin list.
 *
 * NOTE: Do NOT import this from other modules. Each module that needs
 * a scoped profiles model creates its own to avoid cross-module coupling.
 */
@Table({
  tableName: 'profiles',
  timestamps: false,
  underscored: true,
})
export class ReleaseNoteProfileModel extends Model {
  @PrimaryKey
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'full_name' })
  declare fullName: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare plan: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'release_notes_seen_at' })
  declare releaseNotesSeenAt: Date | null;

  @Column({ field: 'created_at', type: DataType.DATE })
  declare createdAt: Date;
}
