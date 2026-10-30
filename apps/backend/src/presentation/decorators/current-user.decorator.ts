import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface CurrentUserPayload {
  sub: string;
  /**
   * 'admin' was added (2026-10-30) to support the release-notes module, where
   * both super_admin and admin may publish notes. 'admin' is a FORBIDDEN_ROLES
   * entry (cannot self-register), so it is always granted by a super_admin.
   */
  role: 'super_admin' | 'admin' | 'doctor' | 'patient' | 'assistant' | 'seller';
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
