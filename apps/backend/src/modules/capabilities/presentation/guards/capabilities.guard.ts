import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { CapabilityDeniedError } from '../../domain/errors/capability-denied.error';
import { ResolveCapabilitiesUseCase } from '../../application/use-cases/capabilities/resolve-capabilities.use-case';
import {
  CAPABILITY_KEY,
  type RequiredCapability,
} from '../decorators/require-capability.decorator';

/**
 * Guard that enforces module-level capability gating.
 *
 * Must be applied AFTER an authentication guard (e.g. DevAuthGuard) that has
 * already populated `request.user`. Uses @RequireCapability() metadata to
 * determine which (moduleKey, action) is required.
 *
 * When no @RequireCapability() metadata is present, the guard allows access
 * (the route opts out of capability enforcement).
 *
 * Coexists with RolesGuard — apply both when needed:
 *   @UseGuards(DevAuthGuard, RolesGuard, CapabilitiesGuard)
 *
 * Throws CapabilityDeniedError (403 CAPABILITY_DENIED) on denial.
 */
@Injectable()
export class CapabilitiesGuard implements CanActivate {
  private readonly logger = new Logger(CapabilitiesGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly resolveCapabilities: ResolveCapabilitiesUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredCapability | undefined>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequireCapability() — route opts out of capability enforcement
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    const user = request.user;

    if (!user) {
      throw new CapabilityDeniedError(required.moduleKey, required.action);
    }

    let modules: Awaited<ReturnType<ResolveCapabilitiesUseCase['execute']>>['modules'];
    try {
      const result = await this.resolveCapabilities.execute(user.role);
      modules = result.modules;
    } catch (err) {
      // If capability resolution fails entirely, deny access (fail-closed)
      this.logger.error('Failed to resolve capabilities — denying access', err);
      throw new CapabilityDeniedError(required.moduleKey, required.action);
    }

    const modulePerms = modules[required.moduleKey];
    if (!modulePerms || !modulePerms[required.action]) {
      throw new CapabilityDeniedError(required.moduleKey, required.action);
    }

    return true;
  }
}
