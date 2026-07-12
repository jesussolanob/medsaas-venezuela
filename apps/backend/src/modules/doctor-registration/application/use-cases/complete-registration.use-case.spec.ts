import { CompleteRegistrationUseCase } from './complete-registration.use-case';
import type { IDoctorRegistrationRepository } from '../../domain/repositories/doctor-registration.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import type { VerifyMppsUseCase } from '../../../credential-verification/application/use-cases/verify-mpps.use-case';
import type { ConfigService } from '@nestjs/config';
import { DoctorRegistration } from '../../domain/entities/doctor-registration.entity';

const makeRegistration = (
  overrides: Partial<Parameters<typeof DoctorRegistration.create>[0]> = {},
): DoctorRegistration =>
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
    isActive: true,
    ...overrides,
  });

/** Registration with no cedula yet — represents a row created by Auth0 SSO
 *  before the doctor fills in identity data for the first time. */
const makeEmptyRegistration = () =>
  makeRegistration({ cedula: null, fullName: '', email: 'new@example.com' });

describe('CompleteRegistrationUseCase', () => {
  let useCase: CompleteRegistrationUseCase;
  let mockRepo: jest.Mocked<IDoctorRegistrationRepository>;
  let mockMailer: jest.Mocked<MailerService>;
  let mockVerifyMpps: jest.Mocked<Pick<VerifyMppsUseCase, 'execute'>>;
  let mockConfig: jest.Mocked<Pick<ConfigService, 'get'>>;

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

    mockVerifyMpps = {
      execute: jest.fn().mockResolvedValue({ status: 'pending', attempts: 0, checkedAt: null }),
    };

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'APP_BASE_URL') return 'https://app.deltasalud.com';
        return undefined;
      }),
    } as unknown as jest.Mocked<Pick<ConfigService, 'get'>>;

    useCase = new CompleteRegistrationUseCase(
      mockRepo,
      mockMailer,
      mockVerifyMpps as unknown as VerifyMppsUseCase,
      mockConfig as unknown as ConfigService,
    );
  });

  // ---------------------------------------------------------------------------
  // Core persistence
  // ---------------------------------------------------------------------------

  it('updates registration fields and returns pending status', async () => {
    const registration = makeRegistration();
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
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
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
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

  it('persists specialty when provided', async () => {
    const registration = makeRegistration({ specialty: 'Cardiología' });
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
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
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
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

  // ---------------------------------------------------------------------------
  // Admin notifications
  // ---------------------------------------------------------------------------

  it('sends template email to all super admins with full doctor details', async () => {
    const registration = makeRegistration({
      mppsNumber: 'MP-001',
      colegiadoNumber: 'COL-002',
      specialty: 'Cardiología',
    });
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'a1', email: 'a1@x.com', fullName: 'Admin 1' },
      { id: 'a2', email: 'a2@x.com', fullName: 'Admin 2' },
    ]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-3' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Carlos M.', cedula: 'V-12345678' });

    // Allow fire-and-forget to settle
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_pending_verification',
      ['a1@x.com', 'a2@x.com'],
      {
        doctorId: 'doc-1',
        fullName: 'Carlos M.',
        doctorEmail: 'carlos@example.com',
        cedula: 'V-12345678',
        specialty: 'Cardiología',
        mppsNumber: 'MP-001',
        colegiadoNumber: 'COL-002',
      },
      { type: 'admin', id: null },
    );
  });

  it('uses "No especificado" for absent optional fields in template variables', async () => {
    const registration = makeRegistration(); // mppsNumber, colegiadoNumber, specialty all null
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'a1', email: 'a1@x.com', fullName: 'Admin' },
    ]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-fallback' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Carlos M.', cedula: 'V-12345678' });
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'doctor_pending_verification',
      ['a1@x.com'],
      expect.objectContaining({
        specialty: 'No especificado',
        mppsNumber: 'No especificado',
        colegiadoNumber: 'No especificado',
      }),
      { type: 'admin', id: null },
    );
  });

  it('does not send admin email when no super admins exist', async () => {
    const registration = makeRegistration();
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' });
    await Promise.resolve();

    // Only the welcome email should be sent (no admin email)
    const calls = (mockMailer.sendTemplate as jest.Mock).mock.calls;
    const adminCalls = calls.filter(([tpl]: [string]) => tpl === 'doctor_pending_verification');
    expect(adminCalls).toHaveLength(0);
  });

  it('does not throw when email dispatch fails (fire-and-forget)', async () => {
    const registration = makeRegistration();
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([
      { id: 'a1', email: 'a1@x.com', fullName: 'Admin' },
    ]);
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP down'));

    await expect(
      useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' }),
    ).resolves.toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // MPPS verification
  // ---------------------------------------------------------------------------

  it('dispatches mpps verification fire-and-forget (does not block registration)', async () => {
    const registration = makeRegistration();
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    // verifyMpps rejects but registration should still succeed
    mockVerifyMpps.execute.mockRejectedValueOnce(new Error('SACS down'));

    await expect(
      useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' }),
    ).resolves.toMatchObject({ doctorId: 'doc-1', verificationStatus: 'pending' });
  });

  it('triggers mpps verification with the doctor id', async () => {
    const registration = makeRegistration();
    mockRepo.findById.mockResolvedValue(makeEmptyRegistration());
    mockRepo.updateRegistration.mockResolvedValue(registration);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Dr.', cedula: 'V-1' });
    // Allow fire-and-forget to settle
    await Promise.resolve();

    expect(mockVerifyMpps.execute).toHaveBeenCalledWith('doc-1');
  });

  // ---------------------------------------------------------------------------
  // Welcome email — first registration gating
  // ---------------------------------------------------------------------------

  it('sends welcome email on first registration (prior cedula is null)', async () => {
    const updated = makeRegistration({ email: 'new@example.com', fullName: 'Ana G.' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: null }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'welcome-msg' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Ana G.', cedula: 'V-99999' });
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'welcome',
      'new@example.com',
      { doctorName: 'Ana G.', appUrl: 'https://app.deltasalud.com' },
      { type: 'doctor', id: 'doc-1' },
    );
  });

  it('sends welcome email on first registration (prior cedula is blank string)', async () => {
    const updated = makeRegistration({ email: 'new@example.com', fullName: 'Pedro R.' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: '   ' }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'welcome-msg-2' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Pedro R.', cedula: 'V-11111' });
    await Promise.resolve();

    const welcomeCalls = (mockMailer.sendTemplate as jest.Mock).mock.calls.filter(
      ([tpl]: [string]) => tpl === 'welcome',
    );
    expect(welcomeCalls).toHaveLength(1);
  });

  it('sends welcome email when prior profile does not exist yet (findById returns null)', async () => {
    const updated = makeRegistration({ email: 'ghost@example.com', fullName: 'Ghost Dr.' });
    mockRepo.findById.mockResolvedValue(null);
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'welcome-ghost' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Ghost Dr.', cedula: 'V-00001' });
    await Promise.resolve();

    const welcomeCalls = (mockMailer.sendTemplate as jest.Mock).mock.calls.filter(
      ([tpl]: [string]) => tpl === 'welcome',
    );
    expect(welcomeCalls).toHaveLength(1);
  });

  it('does NOT send welcome email on re-submit when prior cedula is already set', async () => {
    const updated = makeRegistration({ email: 'carlos@example.com', fullName: 'Carlos M.' });
    // Prior row already has a cedula → re-submit scenario
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: 'V-12345678' }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'admin-msg' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Carlos M.', cedula: 'V-12345678' });
    await Promise.resolve();

    const welcomeCalls = (mockMailer.sendTemplate as jest.Mock).mock.calls.filter(
      ([tpl]: [string]) => tpl === 'welcome',
    );
    expect(welcomeCalls).toHaveLength(0);
  });

  it('does NOT send welcome email when updated email is absent', async () => {
    // Edge case: profile somehow has no email address
    const updated = makeRegistration({ email: '' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: null }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);

    await useCase.execute({ doctorId: 'doc-1', fullName: 'No Email Dr.', cedula: 'V-33333' });
    await Promise.resolve();

    const welcomeCalls = (mockMailer.sendTemplate as jest.Mock).mock.calls.filter(
      ([tpl]: [string]) => tpl === 'welcome',
    );
    expect(welcomeCalls).toHaveLength(0);
  });

  it('falls back to "Doctor" when fullName is absent in the welcome email', async () => {
    const updated = makeRegistration({ email: 'noname@example.com', fullName: '' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: null }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'welcome-noname' });

    await useCase.execute({ doctorId: 'doc-1', fullName: '', cedula: 'V-55555' });
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'welcome',
      'noname@example.com',
      expect.objectContaining({ doctorName: 'Doctor' }),
      expect.anything(),
    );
  });

  it('strips trailing slash from APP_BASE_URL for the CTA link', async () => {
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      if (key === 'APP_BASE_URL') return 'https://app.deltasalud.com/';
      return undefined;
    });

    const updated = makeRegistration({ email: 'slash@example.com', fullName: 'Dr. Slash' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: null }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'slash-msg' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Dr. Slash', cedula: 'V-77777' });
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'welcome',
      'slash@example.com',
      expect.objectContaining({ appUrl: 'https://app.deltasalud.com' }),
      expect.anything(),
    );
  });

  it('falls back to FRONTEND_URL when APP_BASE_URL is absent', async () => {
    mockConfig.get = jest.fn().mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'https://front.deltasalud.com';
      return undefined;
    });

    const updated = makeRegistration({ email: 'front@example.com', fullName: 'Dr. Front' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: null }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockResolvedValue({ id: 'front-msg' });

    await useCase.execute({ doctorId: 'doc-1', fullName: 'Dr. Front', cedula: 'V-88888' });
    await Promise.resolve();

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'welcome',
      'front@example.com',
      expect.objectContaining({ appUrl: 'https://front.deltasalud.com' }),
      expect.anything(),
    );
  });

  it('welcome email failure does not throw (fire-and-forget)', async () => {
    const updated = makeRegistration({ email: 'fail@example.com', fullName: 'Dr. Fail' });
    mockRepo.findById.mockResolvedValue(makeRegistration({ cedula: null }));
    mockRepo.updateRegistration.mockResolvedValue(updated);
    mockRepo.findAllSuperAdmins.mockResolvedValue([]);
    mockMailer.sendTemplate.mockRejectedValue(new Error('welcome SMTP error'));

    await expect(
      useCase.execute({ doctorId: 'doc-1', fullName: 'Dr. Fail', cedula: 'V-66666' }),
    ).resolves.toMatchObject({ doctorId: 'doc-1' });
  });
});
