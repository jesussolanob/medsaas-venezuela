import {
  Column,
  CreatedAt,
  DataType,
  Default,
  DeletedAt,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

/**
 * Sequelize model for the `patients` table (T-05 in spec 03b-schema-real.md).
 *
 * PHI columns (full_name, cedula, phone, email) store AES-256-GCM ciphertext —
 * encryption and decryption happen in SequelizePatientRepository, NOT here.
 *
 * The *_search_hash columns hold deterministic HMAC-SHA256 hex strings computed
 * in the repository layer before persisting. They enable equality lookups without
 * decrypting the stored ciphertext.
 *
 * paranoid: true enables soft-delete via deleted_at column.
 */
@Table({
  tableName: 'patients',
  timestamps: true,
  underscored: true,
  paranoid: true,
})
export class PatientModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.UUID, allowNull: true, field: 'auth_user_id' })
  declare authUserId: string | null;

  /** Stores AES-256-GCM ciphertext — decrypt in repository before returning. */
  @Column({ type: DataType.TEXT, allowNull: false, field: 'full_name' })
  declare fullName: string;

  @Column({ type: DataType.STRING(64), allowNull: true, field: 'full_name_search_hash' })
  declare fullNameSearchHash: string | null;

  /** Stores AES-256-GCM ciphertext. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'cedula' })
  declare cedula: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true, field: 'cedula_search_hash' })
  declare cedulaSearchHash: string | null;

  /** Stores AES-256-GCM ciphertext. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'phone' })
  declare phone: string | null;

  /** Stores AES-256-GCM ciphertext. */
  @Column({ type: DataType.TEXT, allowNull: true, field: 'email' })
  declare email: string | null;

  @Column({ type: DataType.STRING(64), allowNull: true, field: 'email_search_hash' })
  declare emailSearchHash: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare source: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true, field: 'birth_date' })
  declare birthDate: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare age: number | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare sex: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'blood_type' })
  declare bloodType: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare allergies: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'chronic_conditions' })
  declare chronicConditions: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare address: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare city: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'emergency_contact_name' })
  declare emergencyContactName: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'emergency_contact_phone' })
  declare emergencyContactPhone: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare notes: string | null;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;

  /** Soft-delete timestamp. Set by Sequelize paranoid mode on destroy(). */
  @DeletedAt
  @Column({ type: DataType.DATE, field: 'deleted_at' })
  declare deletedAt: Date | null;
}
