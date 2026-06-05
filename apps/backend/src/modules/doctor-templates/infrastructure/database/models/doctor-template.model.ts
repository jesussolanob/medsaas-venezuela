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
import type { TemplateTypeValue } from '../../../domain/value-objects/template-type.vo';

/**
 * Sequelize model for the `doctor_templates` table.
 *
 * IMPORTANT:
 *   - Sequelize is provided globally via SequelizeModule.forRootAsync in AppModule.
 *     Only register this model via SequelizeModule.forFeature([DoctorTemplateModel]).
 *   - Never add Sequelize to module providers directly — it causes dist boot crash.
 *   - logo_url / signature_url are plain strings (CDN URLs). Upload handling is Fase 5.
 */
@Table({
  tableName: 'doctor_templates',
  timestamps: true,
  underscored: true,
})
export class DoctorTemplateModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'doctor_id' })
  declare doctorId: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'template_type' })
  declare templateType: TemplateTypeValue;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'logo_url' })
  declare logoUrl: string | null;

  @Column({ type: DataType.TEXT, allowNull: true, field: 'signature_url' })
  declare signatureUrl: string | null;

  @Default('Inter')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'font_family' })
  declare fontFamily: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'header_text' })
  declare headerText: string;

  @Default('')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'footer_text' })
  declare footerText: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'show_logo' })
  declare showLogo: boolean;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'show_signature' })
  declare showSignature: boolean;

  @Default('#0891b2')
  @Column({ type: DataType.TEXT, allowNull: false, field: 'primary_color' })
  declare primaryColor: string;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
