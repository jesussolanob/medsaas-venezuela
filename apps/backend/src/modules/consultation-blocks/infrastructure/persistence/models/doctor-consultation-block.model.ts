import {
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `doctor_consultation_blocks` table.
 *
 * Composite PK: (doctor_id, block_key).
 * Contains the doctor's personal overrides over the catalog defaults.
 *
 * printable and send_to_patient are nullable — null means "use catalog default".
 */
@Table({
  tableName: 'doctor_consultation_blocks',
  timestamps: false,
  underscored: true,
})
export class DoctorConsultationBlockModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @PrimaryKey
  @Column({ type: DataType.TEXT, allowNull: false, field: 'block_key' })
  declare blockKey: string;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'custom_label' })
  declare customLabel: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'custom_content_type' })
  declare customContentType: string | null;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare enabled: boolean;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false, field: 'sort_order' })
  declare sortOrder: number;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare printable: boolean | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true, field: 'send_to_patient' })
  declare sendToPatient: boolean | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'custom_description' })
  declare customDescription: string | null;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
