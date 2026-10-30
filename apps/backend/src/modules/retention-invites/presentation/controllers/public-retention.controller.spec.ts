import { Test, TestingModule } from '@nestjs/testing';
import { PublicRetentionController } from './public-retention.controller';
import { RecordInviteClickUseCase } from '../../application/use-cases/record-invite-click.use-case';

describe('PublicRetentionController', () => {
  let controller: PublicRetentionController;
  let recordClick: jest.Mocked<RecordInviteClickUseCase>;

  beforeEach(async () => {
    recordClick = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RecordInviteClickUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicRetentionController],
      providers: [{ provide: RecordInviteClickUseCase, useValue: recordClick }],
    }).compile();

    controller = module.get(PublicRetentionController);
  });

  it('calls use case with the token from the body', async () => {
    await controller.click({ t: 'valid.token' });
    expect(recordClick.execute).toHaveBeenCalledWith({ token: 'valid.token' });
  });

  it('rejects missing token with ZodError', async () => {
    await expect(controller.click({})).rejects.toThrow();
    expect(recordClick.execute).not.toHaveBeenCalled();
  });

  it('rejects empty token string with ZodError', async () => {
    await expect(controller.click({ t: '' })).rejects.toThrow();
  });

  it('returns void (204 No Content)', async () => {
    const result = await controller.click({ t: 'tok' });
    expect(result).toBeUndefined();
  });
});
