import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PORT } from './application/ports/email.port';
import { createEmailAdapter } from './infrastructure/adapters/email-adapter.factory';
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
 * NOTE: No Sequelize models — this module has no database dependency.
 * IMPORTANT: Never add Sequelize or database providers here.
 *
 * Other modules that need to send email should import EmailModule and
 * inject the EMAIL_PORT token.
 */
@Module({
  controllers: [EmailController],
  providers: [
    {
      provide: EMAIL_PORT,
      useFactory: (config: ConfigService) => createEmailAdapter(config),
      inject: [ConfigService],
    },
  ],
  exports: [EMAIL_PORT],
})
export class EmailModule {}
