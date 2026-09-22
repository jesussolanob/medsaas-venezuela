import { CreateNotificationUseCase } from './create-notification.use-case';
import type { INotificationRepository } from '../../domain/repositories/inotification.repository';
import { Notification } from '../../domain/entities/notification.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';

function makeRepo(): jest.Mocked<INotificationRepository> {
  return {
    create: jest.fn().mockImplementation((n: Notification) => Promise.resolve(n)),
    listForDoctor: jest.fn(),
    countUnreadForDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };
}

describe('CreateNotificationUseCase', () => {
  it('calls repo.create with a Notification constructed from the input', async () => {
    const repo = makeRepo();
    const uc = new CreateNotificationUseCase(repo);

    const result = await uc.execute({
      doctorId: DOCTOR_ID,
      type: 'quote_accepted',
      title: 'Presupuesto PRE-0001 aceptado',
      body: 'El presupuesto PRE-0001 fue aceptado.',
      entityType: 'quote',
      entityId: QUOTE_ID,
    });

    expect(repo.create).toHaveBeenCalledTimes(1);
    const created = (repo.create as jest.Mock).mock.calls[0][0] as Notification;

    expect(created.doctorId).toBe(DOCTOR_ID);
    expect(created.type).toBe('quote_accepted');
    expect(created.title).toBe('Presupuesto PRE-0001 aceptado');
    expect(created.body).toBe('El presupuesto PRE-0001 fue aceptado.');
    expect(created.entityType).toBe('quote');
    expect(created.entityId).toBe(QUOTE_ID);
    expect(created.readAt).toBeNull();

    // Return value is what the repo returns
    expect(result).toBe(created);
  });

  it('generates a UUID v4 for the new notification id', async () => {
    const repo = makeRepo();
    const uc = new CreateNotificationUseCase(repo);

    await uc.execute({
      doctorId: DOCTOR_ID,
      type: 'quote_rejected',
      title: 'Presupuesto PRE-0002 rechazado',
      body: 'El presupuesto PRE-0002 fue rechazado.',
    });

    const created = (repo.create as jest.Mock).mock.calls[0][0] as Notification;
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('defaults entityType and entityId to null when absent', async () => {
    const repo = makeRepo();
    const uc = new CreateNotificationUseCase(repo);

    await uc.execute({
      doctorId: DOCTOR_ID,
      type: 'quote_accepted',
      title: 'Test',
      body: 'Test body',
    });

    const created = (repo.create as jest.Mock).mock.calls[0][0] as Notification;
    expect(created.entityType).toBeNull();
    expect(created.entityId).toBeNull();
  });
});
