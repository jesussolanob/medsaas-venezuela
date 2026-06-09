import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { DomainError } from '../../domain/errors/domain.error';
import { safeStringify, parseErrorLocation } from '@delta/shared-utils';

interface ErrorBody {
  success: false;
  code: string;
  message: string;
}

/**
 * Catches every unhandled exception and maps it to a consistent error envelope.
 *
 * - HttpException  → its own status, code HTTP_ERROR
 * - DomainError    → 422 Unprocessable Entity, code = the domain error code
 * - anything else  → 500, logged via logger.warn with [file][method] nomenclature;
 *                    reported to Sentry only in production.
 *
 * Policy: NEVER console.error — use logger.warn so Cloud Run structured logs
 * capture it without triggering instance-level error counters.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string' ? res : ((res as { message?: string }).message ?? message);
      code = 'HTTP_ERROR';
    } else if (exception instanceof DomainError) {
      status = exception.httpStatus ?? HttpStatus.UNPROCESSABLE_ENTITY;
      code = exception.code;
      message = exception.message;
    } else {
      // Unexpected 5xx error — log with structured nomenclature and report to Sentry (prod only).
      const err = exception instanceof Error ? exception : new Error(String(exception));
      const { file, method } = parseErrorLocation(err);
      const readableMessage = err.message || 'Unhandled exception';

      // Always log so Cloud Run structured logs capture it locally and in prod.
      this.logger.warn(
        `[${file}][${method}] ${readableMessage} ${safeStringify({ name: err.name, stack: err.stack?.split('\n')[1]?.trim() ?? '' })}`,
      );

      // Send to Sentry only in production to avoid noise during local development.
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(exception);
      }
    }

    const body: ErrorBody = { success: false, code, message };
    response.status(status).json(body);
  }
}
