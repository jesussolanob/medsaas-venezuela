import { Test, TestingModule } from '@nestjs/testing';
import { MeCapabilitiesController } from './me-capabilities.controller';
import { ResolveCapabilitiesUseCase } from '../../application/use-cases/capabilities/resolve-capabilities.use-case';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const mockResolveUseCase = {
  execute: jest.fn(),
};

describe('MeCapabilitiesController', () => {
  let controller: MeCapabilitiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeCapabilitiesController],
      providers: [{ provide: ResolveCapabilitiesUseCase, useValue: mockResolveUseCase }],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<MeCapabilitiesController>(MeCapabilitiesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns capability map for authenticated user', async () => {
    const modules = {
      agenda: { view: true, create: true, edit: true, delete: false },
      patients: { view: true, create: false, edit: false, delete: false },
    };
    mockResolveUseCase.execute.mockResolvedValue({ role: 'doctor', modules });

    const user: CurrentUserPayload = { sub: 'user-1', role: 'doctor', email: 'doctor@dev.local' };
    const result = await controller.getMyCapabilities(user);

    expect(result.success).toBe(true);
    expect(result.data.role).toBe('doctor');
    expect(result.data.modules).toEqual(modules);
    expect(mockResolveUseCase.execute).toHaveBeenCalledWith('doctor');
  });

  it('passes the correct role from CurrentUser to use case', async () => {
    mockResolveUseCase.execute.mockResolvedValue({ role: 'patient', modules: {} });

    const user: CurrentUserPayload = { sub: 'user-2', role: 'patient', email: 'patient@dev.local' };
    await controller.getMyCapabilities(user);

    expect(mockResolveUseCase.execute).toHaveBeenCalledWith('patient');
  });
});
