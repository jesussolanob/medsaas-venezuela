// Sentry must be imported before any other NestJS/application code so that
// its OpenTelemetry instrumentation patches are applied at startup.
import './instrument';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enforce a 512 kb hard cap on all JSON request bodies before any controller
  // sees the data. This is the outer guard; BlockContentSanitizer also enforces
  // 300 000 chars at the use-case boundary (defense-in-depth).
  app.useBodyParser('json', { limit: '512kb' });

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`🚀 Backend running at http://localhost:${port}/${globalPrefix}`, 'Bootstrap');
}

bootstrap().catch((error) => {
  Logger.error('Failed to bootstrap application', error, 'Bootstrap');
  process.exit(1);
});
