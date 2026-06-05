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
import type { DayScheduleParams } from '../../../domain/value-objects/day-schedule.vo';

/**
 * Sequelize model for the `doctor_offices` table.
 *
 * `schedule` is stored as JSONB — an array of DaySchedule entries.
 * The domain layer owns the canonical shape (DayScheduleParams[]).
 *
 * IMPORTANT:
 *   - Sequelize is provided globally via SequelizeModule.forRootAsync in AppModule.
 *     Only register this model via SequelizeModule.forFeature([OfficeModel]).
 *   - Never add Sequelize to module providers directly — it causes dist boot crash.
 */
@Table({
  tableName: 'doctor_offices',
  timestamps: true,
  underscored: true,
})
export class OfficeModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare address: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare city: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: true })
  declare phone: string;

  // JSONB: array of DayScheduleParams
  @Default([])
  @Column({ type: DataType.JSONB, allowNull: false })
  declare schedule: DayScheduleParams[];

  @Default(30)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'slot_duration' })
  declare slotDuration: number;

  @Default(10)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'buffer_minutes' })
  declare bufferMinutes: number;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'is_active' })
  declare isActive: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
