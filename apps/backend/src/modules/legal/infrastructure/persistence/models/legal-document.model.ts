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
 * Sequelize model for the `legal_documents` table.
 *
 * Stores versioned legal documents (Terms & Conditions, Privacy Policy, etc.)
 * as HTML content served to the frontend.
 *
 * NOTE: Sequelize is provided globally via SequelizeModule.forRootAsync in
 * AppModule. Never re-declare the Sequelize provider in this module.
 */
@Table({
  tableName: 'legal_documents',
  timestamps: true,
  underscored: true,
})
export class LegalDocumentModel extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'doc_type' })
  declare docType: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare version: string;

  @Column({ type: DataType.TEXT, allowNull: false, field: 'content_html' })
  declare contentHtml: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false, field: 'is_current' })
  declare isCurrent: boolean;

  @CreatedAt
  @Column({ field: 'created_at' })
  declare createdAt: Date;

  @UpdatedAt
  @Column({ field: 'updated_at' })
  declare updatedAt: Date;
}
