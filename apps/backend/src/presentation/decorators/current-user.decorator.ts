import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface CurrentUserPayload {
  sub: string;
  role: 'super_admin' | 'doctor' | 'patient' | 'assistant';
  email: string;
}

/**
 * Extracts the authenticated user (set by the active auth guard) from the request.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: CurrentUserPayload }>();
    return request.user;
  },
);
