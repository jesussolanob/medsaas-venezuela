import { CompleteRegistrationUseCase } from './complete-registration.use-case';
import type { IDoctorRegistrationRepository } from '../../domain/repositories/doctor-registration.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';

const makeRegistration = (overrides = {}): DoctorRegistration =>
  DoctorRegistration.create({
    id: 'doc-1',
    fullName: 'Carlos M.',
    email: 'carlos@example.com',
    cedula: 'V-12345678',
    mppsNumber: null,
    colegiadoNumber: null,
    specialty: null,
    verificationStatus: 'pending',
    verifiedAt: null,
    verifiedBy: null,
    createdAt: new Date(),
    ...overrides,
  });

describe('CompleteRegistrationUseCase', () => {
  let useCase: CompleteRegistrationUseCase;
  let mockRepo: jest.Mocked<IDoctorRegistrationRepository>;
  let mockMailer: jest.Mocked<MailerService>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      updateRegistration: jest.fn(),
      updateVerification: jest.fn(),
      listByVerificationStatus: jest.fn(),
      findAllSuperAdmins: jest.fn(),
    } as unknown as jest.Mocked<IDoctorRegistrationRepository>;

    mockMailer = {
      sendTemplate: jest.fn(),
    } as unknown as jest.Mocked<MailerService>;

    useCase = new CompleteRegistrationUseCase(mockRepo, mockMailer);
  });

  it('updates registration fields and returns pending status', async () => {
    const registration = makeRegistration();
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'admin-1', email: 'admin@example.com', fullName: 'Admin' },
    ]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    const result = await useCase.execute({
      doctorId: 'doc-1',
      fullName: 'Carlos M.',
      cedula: 'V-12345678',
    });

    expect(mockRepo.updateRegistration).toHaveBeenCalledWith('doc-1', {
      fullName: 'Carlos M.',
      cedula: 'V-12345678',
      mppsNumber: null,
      colegiadoNumber: null,
      specialty: null,
    });
    expect(result.doctorId).toBe('doc-1');
    expect(result.verificationStatus).toBe('pending');
  });

  it('passes optional mppsNumber and colegiadoNumber to repo', async () => {
    const registration = makeRegistration({ mppsNumber: 'MP-1', colegiadoNumber: 'COL-2' });
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-2' });

    await useCase.execute({
      doctorId: 'doc-1',
      fullName: 'Dr. Name',
      cedula: 'V-999',
      mppsNumber: 'MP-1',
      colegiadoNumber: 'COL-2',
    });

    expect(mockRepo.updateRegistration).toHaveBeenCalledWith('doc-1', {
      fullName: 'Dr. Name',
      cedula: 'V-999',
      mppsNumber: 'MP-1',
      colegiadoNumber: 'COL-2',
      specialty: null,
    });
  });

  it('sends template email to all super admins', async () => {
    const registration = makeRegistration();
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'a1', email: 'a1@x.com', fullName: 'Admin 1' },
      { id: 'a2', email: 'a2@x.com', fullName: 'Admin 2' },
    ]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-3' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' });

    // Allow fire-and-forget to settle
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_pending_verification',
      ['a1@x.com', 'a2@x.com'],
      { doctorId: 'doc-1' },
    );
  });

  it('does not send email when no super admins exist', async () => {
    const registration = makeRegistration();
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' });
    await Promise.resolve();

    expect(mockMailer.sendTemplate).not.toHaveBeenCalled();
  });

  it('does not throw when email dispatch fails (fire-and-forget)', async () => {
    const registration = makeRegistration();
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'a1', email: 'a1@x.com', fullName: 'Admin' },
    ]);
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP down'));

    await expect(
      useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' }),
    ).resolves.toBeDefined();
  });

  it('persists specialty when provided', async () => {
    const registration = makeRegistration({ specialty: 'Cardiología' });
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);

    await useCase.execute({
      doctorId: 'doc-1',
      fullName: 'Dr. Card',
      cedula: 'V-123',
      specialty: 'Cardiología',
    });

    expect(mockRepo.updateRegistration).toHaveBeenCalledWith('doc-1', {
      fullName: 'Dr. Card',
      cedula: 'V-123',
      mppsNumber: null,
      colegiadoNumber: null,
      specialty: 'Cardiología',
    });
  });

  it('persists null specialty when not provided', async () => {
    const registration = makeRegistration();
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);

    await useCase.execute({
      doctorId: 'doc-1',
      fullName: 'Dr. Gen',
      cedula: 'V-456',
    });

    expect(mockRepo.updateRegistration).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({ specialty: null }),
    );
  });
});
