import { Test, type TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { ResolveIdentityUseCase } from '../../application/use-cases/resolve-identity.use-case';
import {
  ResolveSecretNotConfiguredError,
  ResolveSecretInvalidError,
} from '../../domain/errors/identity-resolve.error';

const VALID_SECRET = 'dev-resolve-secret';

describe('AuthController', () => {
  let controller: AuthController;

  const mockUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: ResolveIdentityUseCase, useValue: mockUseCase }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    mockUseCase.execute.mockReset();
  });

  it('returns success:true with created:true when use case creates identity', async () => {
    mockUseCase.execute.mockResolvedValue({
      id: 'uuid-1',
      email: 'new@example.com',
      fullName: 'New Doc',
      role: 'doctor',
      created: true,
    });

    const result = await controller.resolveIdentity(VALID_SECRET, {
      email: 'new@example.com',
    });

    expect(result).toEqual({
      success: true,
      data: {
        id: 'uuid-1',
        email: 'new@example.com',
        fullName: 'New Doc',
        role: 'doctor',
        created: true,
      },
    });
  });

  it('returns success:true with created:false when use case finds existing identity', async () => {
    mockUseCase.execute.mockResolvedValue({
      id: 'uuid-existing',
      email: 'old@example.com',
      fullName: 'Existing Doc',
      role: 'doctor',
      created: false,
    });

    const result = await controller.resolveIdentity(VALID_SECRET, {
      email: 'old@example.com',
    });

    expect(result.data.created).toBe(false);
    expect(result.data.id).toBe('uuid-existing');
  });

  it('propagates ResolveSecretInvalidError (use case throws when secret wrong)', async () => {
    mockUseCase.execute.mockRejectedValue(new ResolveSecretInvalidError());

    await expect(
      controller.resolveIdentity('bad-secret', { email: 'doc@example.com' }),
    ).rejects.toBeInstanceOf(ResolveSecretInvalidError);
  });

  it('propagates ResolveSecretNotConfiguredError (use case throws when secret missing)', async () => {
    mockUseCase.execute.mockRejectedValue(new ResolveSecretNotConfiguredError());

    await expect(
      controller.resolveIdentity(undefined, { email: 'doc@example.com' }),
    ).rejects.toBeInstanceOf(ResolveSecretNotConfiguredError);
  });

  it('passes the caller secret and dto through to the use case', async () => {
    mockUseCase.execute.mockResolvedValue({
      id: 'uuid-1',
      email: 'doc@example.com',
      fullName: 'Dr. Sub',
      role: 'doctor',
      created: false,
    });

    const dto = { email: 'doc@example.com', sub: 'auth0|abc', fullName: 'Dr. Sub' };
    await controller.resolveIdentity(VALID_SECRET, dto);

    expect(mockUseCase.execute).toHaveBeenCalledWith(dto, VALID_SECRET);
  });

  it('verifies httpStatus codes from domain errors', () => {
    const notConfigured = new ResolveSecretNotConfiguredError();
    expect(notConfigured.httpStatus).toBe(HttpStatus.SERVICE_UNAVAILABLE);

    const invalid = new ResolveSecretInvalidError();
    expect(invalid.httpStatus).toBe(HttpStatus.UNAUTHORIZED);
  });
});
