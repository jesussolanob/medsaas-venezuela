import { Test } from '@nestjs/testing';
import { IntegrationsController } from './integrations.controller';
import { ConnectGoogleUseCase } from '../../application/use-cases/integrations/connect-google.use-case';
import { GetIntegrationStatusUseCase } from '../../application/use-cases/integrations/get-integration-status.use-case';
import { DisconnectGoogleUseCase } from '../../application/use-cases/integrations/disconnect-google.use-case';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const mockUser: CurrentUserPayload = {
  sub: 'doctor-uuid',
  role: 'doctor',
  email: 'doctor@dev.local',
};

describe('IntegrationsController', () => {
  let controller: IntegrationsController;
  let connectGoogle: jest.Mocked<ConnectGoogleUseCase>;
  let getStatus: jest.Mocked<GetIntegrationStatusUseCase>;
  let disconnectGoogle: jest.Mocked<DisconnectGoogleUseCase>;

  beforeEach(async () => {
    connectGoogle = { execute: jest.fn() } as unknown as jest.Mocked<ConnectGoogleUseCase>;
    getStatus = { execute: jest.fn() } as unknown as jest.Mocked<GetIntegrationStatusUseCase>;
    disconnectGoogle = { execute: jest.fn() } as unknown as jest.Mocked<DisconnectGoogleUseCase>;

    const module = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        { provide: ConnectGoogleUseCase, useValue: connectGoogle },
        { provide: GetIntegrationStatusUseCase, useValue: getStatus },
        { provide: DisconnectGoogleUseCase, useValue: disconnectGoogle },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  describe('status endpoint', () => {
    it('returns connected: false when no integration', async () => {
      getStatus.execute.mockResolvedValue({ connected: false });
      const result = await controller.status(mockUser);
      expect(result).toEqual({ success: true, data: { connected: false } });
      expect(getStatus.execute).toHaveBeenCalledWith('doctor-uuid');
    });

    it('returns connected: true with googleEmail', async () => {
      getStatus.execute.mockResolvedValue({ connected: true, googleEmail: 'doc@gmail.com' });
      const result = await controller.status(mockUser);
      expect(result.data.connected).toBe(true);
      expect(result.data.googleEmail).toBe('doc@gmail.com');
    });
  });

  describe('connect endpoint', () => {
    it('calls connectGoogle with doctor sub and authorization code', async () => {
      connectGoogle.execute.mockResolvedValue({ connected: true, googleEmail: 'doc@gmail.com' });
      const result = await controller.connect(mockUser, { code: 'auth-code-123' });
      expect(connectGoogle.execute).toHaveBeenCalledWith('doctor-uuid', 'auth-code-123');
      expect(result.data.connected).toBe(true);
    });
  });

  describe('disconnect endpoint', () => {
    it('calls disconnectGoogle with doctor sub', async () => {
      disconnectGoogle.execute.mockResolvedValue(undefined);
      await controller.disconnect(mockUser);
      expect(disconnectGoogle.execute).toHaveBeenCalledWith('doctor-uuid');
    });
  });
});
