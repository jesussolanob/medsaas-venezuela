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
 * Sequelize model for the `doctor_prompts` table.
 *
 * Created by migration: 20261030000003-doctor-prompts-and-team-meetings.cjs
 *
 * Tracks lifecycle events for prompts shown to doctors (modals, email-triggered
 * flows, etc.). One row per (doctor_id, prompt_key) pair.
 *
 * IMPORTANT: NEVER add Sequelize to module providers — it is provided globally.
 */
@Table({
  tableName: 'doctor_prompts',
  timestamps: true,
  underscored: true,
})
export class DoctorPromptModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, allowNull: false, field: 'id' })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'prompt_key' })
  declare promptKey: string;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'shown_count' })
  declare shownCount: number;

  @Column({ type: DataType.DATE, allowNull: true, field: 'first_shown_at' })
  declare firstShownAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_shown_at' })
  declare lastShownAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'acted_at' })
  declare actedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'snoozed_until' })
  declare snoozedUntil: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'dismissed_at' })
  declare dismissedAt: Date | null;

  @Column({ type: DataType.JSONB, allowNull: true, field: 'metadata' })
  declare metadata: Record<string, unknown> | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
