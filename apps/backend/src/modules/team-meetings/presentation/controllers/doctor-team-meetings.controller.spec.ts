/**
 * Spec: DoctorTeamMeetingsController — RolesGuard enforcement
 *
 * Uses the real RolesGuard with a real Reflector to verify that the controller
 * correctly rejects non-doctor roles. No HTTP layer needed — we drive the guard
 * directly with mock execution contexts that point to the decorated class so
 * the Reflector can read the @Roles('doctor') metadata.
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { DoctorTeamMeetingsController } from './doctor-team-meetings.controller';

function makeContext(role: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'user-1', role } }),
    }),
    // Point to the prototype method so Reflector can read class-level metadata.
    getHandler: () => DoctorTeamMeetingsController.prototype.getCurrent,
    getClass: () => DoctorTeamMeetingsController,
  } as unknown as ExecutionContext;
}

describe('DoctorTeamMeetingsController — RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  it.each(['patient', 'seller', 'super_admin', 'admin'])(
    'forbids role "%s" → ForbiddenException',
    (role) => {
      expect(() => guard.canActivate(makeContext(role))).toThrow(ForbiddenException);
    },
  );

  it('allows role "doctor" → returns true', () => {
    expect(guard.canActivate(makeContext('doctor'))).toBe(true);
  });
});
