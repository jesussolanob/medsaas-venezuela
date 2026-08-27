import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * Guard that enforces role-based access control using the @Roles() decorator.
 *
 * Must be applied AFTER an authentication guard (AppAuthGuard) that sets
 * `request.user`. When no @Roles() metadata is present on a route, access is
 * granted to any authenticated user.
 *
 * Usage:
 *   @UseGuards(AppAuthGuard, RolesGuard)
 *   @Roles('super_admin')
 *   @Post()
 *   updateRate() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<CurrentUserPayload['role'][]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator — route is accessible to any authenticated user.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Tu sesión expiró. Volvé a iniciar sesión.');
    }

    if (!requiredRoles.includes(user.role)) {
      // El mensaje va a la pantalla del usuario: español, sin nombres de rol
      // internos. El detalle técnico (rol requerido vs. rol real) queda en el log
      // del GlobalExceptionFilter, no en la UI.
      //
      // Cuando la pantalla es de administración se nombra la causa más frecuente:
      // el 2026-08-18 la sesión del navegador pasó a ser la de un especialista
      // (otra pestaña de la misma ventana) y el panel abierto siguió mandando
      // acciones. "Insufficient permissions" se leyó como un permiso roto.
      throw new ForbiddenException(
        requiredRoles.includes('super_admin')
          ? 'Tu sesión no tiene permisos de administrador. Si iniciaste sesión con otra cuenta en esta ventana, cerrá sesión y volvé a entrar.'
          : 'No tenés permisos para realizar esta acción.',
      );
    }

    return true;
  }
}
