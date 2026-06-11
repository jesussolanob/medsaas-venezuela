import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import type { JourneyStep } from '../../../domain/entities/telemetry-session.entity';

/**
 * Sequelize model for the `telemetry_sessions` table.
 *
 * One row per unique session_id.
 * The journey column holds the full navigation path as a JSONB array.
 *
 * SECURITY:
 *   - NEVER log the `journey` column — it is runtime-derived JSONB.
 *   - PiiGuard runs at domain layer before any step enters the journey.
 *   - doctor_id is nullable (ON DELETE SET NULL) so session history
 *     survives profile deletion as anonymised records.
 */
@Table({
  tableName: 'telemetry_sessions',
  timestamps: false,
  underscored: true,
})
export class TelemetrySessionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @Column({ type: DataType.TEXT, allowNull: false, field: 'session_id' })
  declare sessionId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'doctor_id' })
  declare doctorId: string | null;

  @Default([])
  @Column({ type: DataType.JSONB, allowNull: false })
  declare journey: JourneyStep[];

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'event_count' })
  declare eventCount: number;

  @Column({ type: DataType.DATE, allowNull: false, field: 'started_at' })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, allowNull: false, field: 'last_seen_at' })
  declare lastSeenAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'ended_at' })
  declare endedAt: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;
}
