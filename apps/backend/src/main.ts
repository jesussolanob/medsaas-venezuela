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
  //
  // The verify callback captures the raw body bytes on req.rawBody so that the
  // webhook signature controller can compute HMAC-SHA256 over the original wire
  // bytes rather than a re-serialised version.  Without this, any key ordering
  // or spacing difference between the original payload and JSON.stringify(parsed)
  // would silently break HMAC verification in production.
  app.useBodyParser('json', {
    limit: '512kb',
    verify: (
      req: import('express').Request & { rawBody?: Buffer },
      _res: import('express').Response,
      buf: Buffer,
    ) => {
      req.rawBody = buf;
    },
  });

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
