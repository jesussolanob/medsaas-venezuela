/**
 * EmailTemplate — domain entity representing a stored email template.
 *
 * Templates store the subject and HTML body with {{placeholder}} tokens
 * that are replaced at send time by MailerService.
 *
 * NOTE: This entity has NO external dependencies (no NestJS, no Sequelize).
 */
export class EmailTemplate {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string | null;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(params: {
    id: string;
    name: string;
    subject: string;
    html: string;
    text: string | null;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.subject = params.subject;
    this.html = params.html;
    this.text = params.text;
    this.description = params.description;
    this.isActive = params.isActive;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  static create(params: {
    id: string;
    name: string;
    subject: string;
    html: string;
    text: string | null;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): EmailTemplate {
    return new EmailTemplate(params);
  }
}
