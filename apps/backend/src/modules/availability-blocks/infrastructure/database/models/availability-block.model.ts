import {
  Column,
  CreatedAt,
  DataType,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
  Default,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `doctor_availability_blocks` table.
 *
 * Created by migration: 20260611000005-availability-blocks.cjs
 *
 * Stores calendar ranges during which a doctor is unavailable for bookings.
 * All timestamps are TIMESTAMPTZ (UTC). The application layer is responsible
 * for converting America/Caracas local input to UTC before persisting.
 */
@Table({
  tableName: 'doctor_availability_blocks',
  timestamps: true,
  underscored: true,
})
export class AvailabilityBlockModel extends Model {
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

  @Column({ type: DataType.TEXT, allowNull: true, field: 'reason' })
  declare reason: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
