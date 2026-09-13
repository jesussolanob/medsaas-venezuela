import {
  GetBookingUnusedSessionsUseCase,
  type BookingUnusedSessionsRow,
} from './get-booking-unused-sessions.use-case';
import { InvalidEmailError } from './get-booking-packages.use-case';
import type {
  IPendingConsultationRepository,
  PackageUsageRow,
} from '../../../../pending-consultations/domain/repositories/pending-consultation.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import type { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

const DOCTOR_ID = 'doc-uuid-1111-2222-3333-444444444444';
const PATIENT_ID = 'pat-uuid-1111-2222-3333-444444444444';
const EMAIL = 'patient@example.com';
const EMAIL_HASH = 'hashed-email-abc123';

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'María García',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeUsageRow(overrides: Partial<PackageUsageRow> = {}): PackageUsageRow {
  return {
    patientId: PATIENT_ID,
    planName: 'Terapia Completa',
    totalSessions: 3,
    attended: 0,
    scheduled: 0,
    noShow: 0,
    pendingScheduling: 0,
    ...overrides,
  };
}

function makeCrypto(): jest.Mocked<CryptoService> {
  return {
    hashForSearch: jest.fn().mockReturnValue(EMAIL_HASH),
  } as unknown as jest.Mocked<CryptoService>;
}

function makePendingRepo(
  rows: PackageUsageRow[] = [],
): jest.Mocked<IPendingConsultationRepository> {
  return {
    findById: jest.fn(),
    findByIdAndDoctor: jest.fn(),
    findByDoctor: jest.fn(),
    findExpired: jest.fn(),
    bulkCreate: jest.fn(),
    save: jest.fn(),
    bulkExpire: jest.fn(),
    findDueForReminder: jest.fn(),
    updateReminderStage: jest.fn(),
    getPackageUsage: jest.fn().mockResolvedValue(rows),
  } as jest.Mocked<IPendingConsultationRepository>;
}

function makePatientRepo(patient: Patient | null = makePatient()): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn(),
    findByCedulaHash: jest.fn(),
    findByEmailHash: jest.fn().mockResolvedValue(patient),
    list: jest.fn(),
    findAllByDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    logReveal: jest.fn(),
  } as jest.Mocked<IPatientRepository>;
}

function buildUseCase(
  pendingRows: PackageUsageRow[] = [],
  patient: Patient | null = makePatient(),
): {
  useCase: GetBookingUnusedSessionsUseCase;
  pendingRepo: jest.Mocked<IPendingConsultationRepository>;
  patientRepo: jest.Mocked<IPatientRepository>;
  crypto: jest.Mocked<CryptoService>;
} {
  const crypto = makeCrypto();
  const pendingRepo = makePendingRepo(pendingRows);
  const patientRepo = makePatientRepo(patient);
  const useCase = new GetBookingUnusedSessionsUseCase(pendingRepo, patientRepo, crypto);
  return { useCase, pendingRepo, patientRepo, crypto };
}

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

describe('GetBookingUnusedSessionsUseCase — email validation', () => {
  it('throws InvalidEmailError for a malformed email', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute(DOCTOR_ID, 'not-an-email')).rejects.toBeInstanceOf(
      InvalidEmailError,
    );
  });

  it('throws InvalidEmailError for an empty string', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute(DOCTOR_ID, '')).rejects.toBeInstanceOf(InvalidEmailError);
  });

  it('does not call patientRepo when email is invalid', async () => {
    const { useCase, patientRepo } = buildUseCase();

    await useCase.execute(DOCTOR_ID, 'bad@@mail').catch(() => undefined);

    expect(patientRepo.findByEmailHash).not.toHaveBeenCalled();
  });

  it('hashes the email before the patient lookup', async () => {
    const { useCase, crypto, patientRepo } = buildUseCase();

    await useCase.execute(DOCTOR_ID, EMAIL);

    expect(crypto.hashForSearch).toHaveBeenCalledWith(EMAIL);
    expect(patientRepo.findByEmailHash).toHaveBeenCalledWith(EMAIL_HASH, DOCTOR_ID);
  });
});

// ---------------------------------------------------------------------------
// Unknown patient
// ---------------------------------------------------------------------------

describe('GetBookingUnusedSessionsUseCase — unknown patient', () => {
  it('returns empty array when the patient is not found (unknown email)', async () => {
    const { useCase } = buildUseCase([], null);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toEqual([]);
  });

  it('does not call getPackageUsage when patient is not found', async () => {
    const { useCase, pendingRepo } = buildUseCase([], null);

    await useCase.execute(DOCTOR_ID, EMAIL);

    expect(pendingRepo.getPackageUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No unused sessions
// ---------------------------------------------------------------------------

describe('GetBookingUnusedSessionsUseCase — no unused sessions', () => {
  it('returns empty array when patient has no packages', async () => {
    const { useCase } = buildUseCase([]);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toEqual([]);
  });

  it('returns empty array when all sessions are fully used', async () => {
    const rows = [makeUsageRow({ totalSessions: 3, attended: 3, pendingScheduling: 0 })];
    const { useCase } = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Returns results with unused sessions
// ---------------------------------------------------------------------------

describe('GetBookingUnusedSessionsUseCase — unused sessions present', () => {
  it('returns plan with correct computed fields', async () => {
    // $240 case: 1 attended out of 3, no pending rows
    const rows = [
      makeUsageRow({
        planName: 'Paquete 3 Sesiones',
        totalSessions: 3,
        attended: 1,
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 0,
      }),
    ];
    const { useCase } = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toHaveLength(1);
    const [plan] = result as [BookingUnusedSessionsRow];
    expect(plan.planName).toBe('Paquete 3 Sesiones');
    expect(plan.totalSessions).toBe(3);
    expect(plan.unusedSessions).toBe(2);
    expect(plan.pendingRows).toBe(0);
    expect(plan.hasPendingRows).toBe(false);
  });

  it('returns plan when pendingRows > 0 even if unusedSessions would be 0', async () => {
    // All booked but still has pending_scheduling rows (edge case)
    const rows = [
      makeUsageRow({
        totalSessions: 3,
        attended: 3,
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 1,
      }),
    ];
    const { useCase } = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toHaveLength(1);
    expect(result[0]?.pendingRows).toBe(1);
    expect(result[0]?.hasPendingRows).toBe(true);
  });

  it('returns plan with hasPendingRows = true when pendingScheduling > 0', async () => {
    const rows = [makeUsageRow({ totalSessions: 5, attended: 2, pendingScheduling: 3 })];
    const { useCase } = buildUseCase(rows);

    const [plan] = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(plan?.hasPendingRows).toBe(true);
    expect(plan?.pendingRows).toBe(3);
    expect(plan?.unusedSessions).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// No PII in response
// ---------------------------------------------------------------------------

describe('GetBookingUnusedSessionsUseCase — no PII in response', () => {
  it('does not include patient_id in the response', async () => {
    const rows = [makeUsageRow({ totalSessions: 3, attended: 1, pendingScheduling: 0 })];
    const { useCase } = buildUseCase(rows);

    const [plan] = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(plan).not.toHaveProperty('patientId');
    expect(plan).not.toHaveProperty('patient_id');
    expect(plan).not.toHaveProperty('bookedSessions');
  });
});

// ---------------------------------------------------------------------------
// Deleted plan (totalSessions = null)
// ---------------------------------------------------------------------------

describe('GetBookingUnusedSessionsUseCase — deleted plan', () => {
  it('returns unusedSessions = 0 and includes plan when pendingRows > 0', async () => {
    const rows = [makeUsageRow({ totalSessions: null, attended: 1, pendingScheduling: 2 })];
    const { useCase } = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toHaveLength(1);
    expect(result[0]?.totalSessions).toBeNull();
    expect(result[0]?.unusedSessions).toBe(0);
    expect(result[0]?.pendingRows).toBe(2);
  });

  it('excludes deleted plan when pendingRows = 0', async () => {
    const rows = [makeUsageRow({ totalSessions: null, attended: 1, pendingScheduling: 0 })];
    const { useCase } = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, EMAIL);

    expect(result).toHaveLength(0);
  });
});
