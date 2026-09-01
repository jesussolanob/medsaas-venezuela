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
 * Sequelize model for the `leads` table (T-12 in spec 03b-schema-real.md).
 *
 * Schema notes (from migration 20260602000000-initial-schema.cjs):
 *   - `channel` is TEXT (not lead_source enum) — accepts both enum values and
 *     frontend LeadChannel values (web|llamada|referido). Spec D-05.
 *   - `stage` is TEXT with a CHECK constraint for 6 allowed values. Spec D-06.
 *   - `source` uses the lead_source PG enum (stored as text in Sequelize).
 *   - `status` uses the lead_status PG enum (stored as text in Sequelize).
 *
 * No encryption — leads are prospect data, not PHI. Phone is contact info for
 * prospective patients but is NOT encrypted (not subject to AES-256-GCM policy
 * which applies to confirmed patient records). Do NOT log phone values.
 */
@Table({
  tableName: 'leads',
  timestamps: true,
  underscored: true,
})
export class LeadModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  // Added by migration 20260901000003-quotes-module
  @Column({ type: DataType.TEXT, allowNull: true, field: 'last_name' })
  declare lastName: string | null;

  // Not encrypted — leads are prospect data, not PHI (same policy as phone).
  @Column({ type: DataType.TEXT, allowNull: true })
  declare email: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare phone: string | null;

  // TEXT — accepts both lead_source enum values and extended frontend channel values.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare channel: string | null;

  // TEXT with CHECK in DB (new|contacted|qualified|appointment|converted|lost).
  @Default('new')
  @Column({ type: DataType.TEXT, allowNull: true })
  declare stage: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare message: string | null;

  // lead_source PG enum stored as TEXT in Sequelize to avoid enum type mapping.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare source: string | null;

  // lead_status PG enum stored as TEXT in Sequelize.
  @Column({ type: DataType.TEXT, allowNull: true })
  declare status: string | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'last_activity' })
  declare lastActivity: Date | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
