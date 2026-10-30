/**
 * Spec: DoctorPromptsController — RolesGuard enforcement
 *
 * Uses the real RolesGuard with a real Reflector to verify that the controller
 * correctly rejects non-doctor roles.
 */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { DoctorPromptsController } from './doctor-prompts.controller';

function makeContext(role: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'user-1', role } }),
    }),
    getHandler: () => DoctorPromptsController.prototype.meetingStatus,
    getClass: () => DoctorPromptsController,
  } as unknown as ExecutionContext;
}

describe('DoctorPromptsController — RolesGuard', () => {
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
