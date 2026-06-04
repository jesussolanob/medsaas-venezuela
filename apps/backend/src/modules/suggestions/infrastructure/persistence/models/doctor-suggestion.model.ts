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
 * Sequelize model for the `doctor_suggestions` table.
 *
 * No encryption — suggestion data (subject, message, category) is not PHI.
 * Do NOT log suggestion content in application logs.
 */
@Table({
  tableName: 'doctor_suggestions',
  timestamps: true,
  underscored: true,
})
export class DoctorSuggestionModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare subject: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare message: string;

  @Default('general')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare category: string;

  // TEXT with CHECK in DB (pending|reviewed|planned|done|rejected).
  @Default('pending')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare status: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'admin_response' })
  declare adminResponse: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
