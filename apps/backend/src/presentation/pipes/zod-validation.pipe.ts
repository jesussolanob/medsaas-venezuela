import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates and parses an input against a Zod schema from @delta/shared-types.
 * On failure, returns a 400 with the flattened list of field errors.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      // Surface the first field error as the top-level message so the front-end
      // displays a meaningful hint instead of the generic "Validation failed".
      const firstError = errors[0];
      const topLevelMessage = firstError
        ? firstError.path
          ? `${firstError.path}: ${firstError.message}`
          : firstError.message
        : 'Validation failed';
      throw new BadRequestException({ message: topLevelMessage, errors });
    }
    return result.data;
  }
}
