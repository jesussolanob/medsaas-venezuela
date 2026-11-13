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
import type {
  TeamMeetingStatus,
  TeamMeetingSource,
} from '../../../domain/entities/team-meeting.entity';

/**
 * Sequelize model for the `team_meetings` table.
 *
 * Created by migration: 20261030000003-doctor-prompts-and-team-meetings.cjs
 *
 * IMPORTANT: NEVER add Sequelize to module providers — it is provided globally.
 */
@Table({
  tableName: 'team_meetings',
  timestamps: true,
  underscored: true,
})
export class TeamMeetingModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID, allowNull: false, field: 'id' })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.DATE, allowNull: false, field: 'starts_at' })
  declare startsAt: Date;

  @Column({ type: DataType.DATE, allowNull: false, field: 'ends_at' })
  declare endsAt: Date;

  @Default('scheduled')
  @Column({
    type: DataType.ENUM('scheduled', 'done', 'no_show', 'cancelled'),
    allowNull: false,
    field: 'status',
  })
  declare status: TeamMeetingStatus;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'meeting_url' })
  declare meetingUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'external_event_id' })
  declare externalEventId: string | null;

  @Column({ type: DataType.UUID, allowNull: true, field: 'availability_block_id' })
  declare availabilityBlockId: string | null;

  @Column({
    type: DataType.ENUM('email', 'modal'),
    allowNull: false,
    field: 'source',
  })
  declare source: TeamMeetingSource;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'notes' })
  declare notes: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'reminder_24h_sent_at' })
  declare reminder24hSentAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'reminder_1h_sent_at' })
  declare reminder1hSentAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
