import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PORT } from './application/ports/email.port';
import { EMAIL_TEMPLATE_REPOSITORY } from './domain/repositories/email-template.repository';
import { createEmailAdapter } from './infrastructure/adapters/email-adapter.factory';
import { SandboxEmailPort } from './infrastructure/adapters/sandbox-email.adapter';
import { EmailTemplateModel } from './infrastructure/database/models/email-template.model';
import { SequelizeEmailTemplateRepository } from './infrastructure/database/repositories/sequelize-email-template.repository';
import { MailerService } from './application/services/mailer.service';
import { EmailController } from './presentation/controllers/email.controller';

/**
 * EmailModule — transactional email delivery via pluggable adapters.
 *
 * Active adapter is selected at runtime via the EMAIL_DRIVER env var:
 *   - 'resend' → ResendEmailAdapter (real delivery)
 *   - 'noop'   → NoopEmailAdapter (logs only, no network call)
 *
 * Default: 'noop' (fail-safe — server boots cleanly even if EMAIL_DRIVER is unset).
 *
 * The adapter is always wrapped in SandboxEmailPort, which intercepts send()
 * calls based on the SANDBOX and SANDBOX_EMAIL env vars:
 *   SANDBOX=true              → suppress delivery (return { id: null })
 *   SANDBOX=false+SANDBOX_EMAIL → redirect all mail to that address
 *   SANDBOX=false (no email)  → pass through to real adapter
 *
 * This single wrapper covers both MailerService and the /api/email/test endpoint
 * because EMAIL_PORT always resolves to SandboxEmailPort.
 *
 * MailerService provides template-driven email sending backed by the
 * `email_templates` table. It is exported so other modules (e.g. BillingModule)
 * can inject it directly.
 *
 * IMPORTANT: Sequelize global instance is NOT added to providers — it is
 * injected globally by SequelizeModule.forRootAsync in AppModule.
 * Adding it again here causes a crash in the dist build.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([EmailTemplateModel]),
  ],
  controllers: [EmailController],
  providers: [
    {
      provide: EMAIL_PORT,
      useFactory: (config: ConfigService) => {
        const inner = createEmailAdapter(config);
        return new SandboxEmailPort(
          inner,
          config.get<string>('SANDBOX'),
          config.get<string>('SANDBOX_EMAIL'),
        );
      },
      inject: [ConfigService],
    },
    {
      provide: EMAIL_TEMPLATE_REPOSITORY,
      useClass: SequelizeEmailTemplateRepository,
    },
    MailerService,
  ],
  exports: [EMAIL_PORT, MailerService],
})
export class EmailModule {}
