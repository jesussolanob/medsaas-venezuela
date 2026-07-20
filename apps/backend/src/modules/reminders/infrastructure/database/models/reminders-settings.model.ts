import {
  Column,
  CreatedAt,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
  Unique,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `reminders_settings` table.
 *
 * One row per doctor (UNIQUE on doctor_id).
 *
 * IMPORTANT:
 *   - Sequelize is provided globally via SequelizeModule.forRootAsync in AppModule.
 *     Only register this model via SequelizeModule.forFeature([RemindersSettingsModel]).
 *   - Never add Sequelize to module providers directly — it causes dist boot crash.
 */
@Table({
  tableName: 'reminders_settings',
  timestamps: true,
  underscored: true,
})
export class RemindersSettingsModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Unique
  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare enabled: boolean;

  @Default('both')
  @Column({ type: DataType.TEXT, allowNull: false })
  declare channel: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'reminder_7d_enabled' })
  declare reminder7dEnabled: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'reminder_24h_enabled' })
  declare reminder24hEnabled: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'reminder_3h_enabled' })
  declare reminder3hEnabled: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'reminder_1h_enabled' })
  declare reminder1hEnabled: boolean;

  @Default(
    'Hola {patient_name}, te recordamos tu cita con el Dr. {doctor_name} el {date} a las {time}.',
  )
  @Column({ type: DataType.TEXT, allowNull: false, field: 'template_7d_whatsapp' })
  declare template7dWhatsapp: string;

  @Default('Hola {patient_name}, mañana tienes cita con el Dr. {doctor_name} a las {time}.')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'template_24h_whatsapp' })
  declare template24hWhatsapp: string;

  @Default('Hola {patient_name}, en 3 horas tienes cita con el Dr. {doctor_name}.')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'template_3h_whatsapp' })
  declare template3hWhatsapp: string;

  @Default('21:00:00')
  @Column({ type: DataType.STRING, allowNull: false, field: 'quiet_hours_start' })
  declare quietHoursStart: string;

  @Default('08:00:00')
  @Column({ type: DataType.STRING, allowNull: false, field: 'quiet_hours_end' })
  declare quietHoursEnd: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
