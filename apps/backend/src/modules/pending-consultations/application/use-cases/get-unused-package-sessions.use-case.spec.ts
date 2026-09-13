import {
  GetUnusedPackageSessionsUseCase,
  type UnusedPackageSessionsRow,
} from './get-unused-package-sessions.use-case';
import type {
  IPendingConsultationRepository,
  PackageUsageRow,
} from '../../domain/repositories/pending-consultation.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { PatientNotOwnedError } from '../../domain/errors/patient-not-owned.error';

const DOCTOR_ID = 'doc-uuid-1111-2222-3333-444444444444';
const PATIENT_ID = 'pat-uuid-1111-2222-3333-444444444444';

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
    findById: jest.fn().mockResolvedValue(patient),
    findByCedulaHash: jest.fn(),
    findByEmailHash: jest.fn(),
    list: jest.fn(),
    findAllByDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    logReveal: jest.fn(),
  } as jest.Mocked<IPatientRepository>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUseCase(
  pendingRows: PackageUsageRow[],
  patient: Patient | null = makePatient(),
): GetUnusedPackageSessionsUseCase {
  return new GetUnusedPackageSessionsUseCase(
    makePendingRepo(pendingRows),
    makePatientRepo(patient),
  );
}

// ---------------------------------------------------------------------------
// Anti-IDOR
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — anti-IDOR', () => {
  it('throws PatientNotOwnedError when the patient does not belong to the doctor', async () => {
    const useCase = buildUseCase([], null);

    await expect(useCase.execute(DOCTOR_ID, PATIENT_ID)).rejects.toBeInstanceOf(
      PatientNotOwnedError,
    );
  });

  it('does not call getPackageUsage when patient ownership check fails', async () => {
    const pendingRepo = makePendingRepo([]);
    const patientRepo = makePatientRepo(null);
    const useCase = new GetUnusedPackageSessionsUseCase(pendingRepo, patientRepo);

    await useCase.execute(DOCTOR_ID, PATIENT_ID).catch(() => undefined);

    expect(pendingRepo.getPackageUsage).not.toHaveBeenCalled();
  });

  it('calls getPackageUsage scoped to the authenticated doctorId', async () => {
    const pendingRepo = makePendingRepo([]);
    const patientRepo = makePatientRepo();
    const useCase = new GetUnusedPackageSessionsUseCase(pendingRepo, patientRepo);

    await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(pendingRepo.getPackageUsage).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID);
  });
});

// ---------------------------------------------------------------------------
// Happy path: package with pending rows generated
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — happy path (pendingRows > 0)', () => {
  it('returns the plan with correct counts when pending rows exist', async () => {
    const rows = [
      makeUsageRow({
        planName: 'Terapia Completa',
        totalSessions: 3,
        attended: 1,
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 2,
      }),
    ];
    const useCase = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(1);
    const [plan] = result as [UnusedPackageSessionsRow];
    expect(plan.planName).toBe('Terapia Completa');
    expect(plan.totalSessions).toBe(3);
    expect(plan.bookedSessions).toBe(1);
    expect(plan.pendingRows).toBe(2);
    expect(plan.unusedSessions).toBe(2);
    expect(plan.hasPendingRows).toBe(true);
  });

  it('sets hasPendingRows to true when pendingScheduling > 0', async () => {
    const rows = [makeUsageRow({ pendingScheduling: 1 })];
    const useCase = buildUseCase(rows);

    const [result] = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result?.hasPendingRows).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The $240 case: unused sessions with ZERO pending rows
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — $240 case (unusedSessions > 0, pendingRows = 0)', () => {
  it('returns the plan when there are unused sessions and no pending rows', async () => {
    // Real case: patient had 1 attended appointment out of 3 session plan,
    // and no pending_consultations rows were generated (pre-feature data).
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
    const useCase = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(1);
    const [plan] = result as [UnusedPackageSessionsRow];
    expect(plan.unusedSessions).toBe(2);
    expect(plan.pendingRows).toBe(0);
    expect(plan.hasPendingRows).toBe(false);
    expect(plan.bookedSessions).toBe(1);
  });

  it('computes bookedSessions as attended + scheduled + noShow', async () => {
    // Mix of attended, scheduled, and no_show — all count as "booked"
    const rows = [
      makeUsageRow({
        totalSessions: 5,
        attended: 1,
        scheduled: 1,
        noShow: 1,
        pendingScheduling: 0,
      }),
    ];
    const useCase = buildUseCase(rows);

    const [result] = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    // bookedSessions = 1 + 1 + 1 = 3; unusedSessions = 5 - 3 = 2
    expect(result?.bookedSessions).toBe(3);
    expect(result?.unusedSessions).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Fully used package — must not be returned
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — fully used package (not returned)', () => {
  it('does not return a plan where all sessions are booked and no pending rows', async () => {
    const rows = [
      makeUsageRow({
        totalSessions: 3,
        attended: 3,
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 0,
      }),
    ];
    const useCase = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(0);
  });

  it('returns empty array when the patient has no packages at all', async () => {
    const useCase = buildUseCase([]);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(0);
  });

  it('does not return a plan where booked > total (over-booked edge case)', async () => {
    // unusedSessions = max(0, ...) — never negative
    const rows = [
      makeUsageRow({
        totalSessions: 3,
        attended: 4, // more attended than total (data anomaly)
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 0,
      }),
    ];
    const useCase = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    // unusedSessions = max(0, 3 - 4) = 0 → excluded
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cancelled appointments do not count as booked
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — cancelled appointments excluded', () => {
  it('does not count cancelled appointments toward bookedSessions', async () => {
    // getPackageUsage already excludes cancelled appointments from all buckets.
    // attended=0, scheduled=0, noShow=0 means all past appointments were cancelled.
    const rows = [
      makeUsageRow({
        totalSessions: 3,
        attended: 0,
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 0,
      }),
    ];
    const useCase = buildUseCase(rows);

    // The query filter (attended + scheduled + noShow + pendingScheduling > 0)
    // would exclude this row, but in case the repo returns it, the use case
    // should also filter it out (unusedSessions = 3, pendingRows = 0 → included?).
    // Actually: totalSessions=3, booked=0, unused=3 → included.
    // This shows 3 unused sessions even though everything was cancelled, which
    // is correct: the patient paid for 3 sessions and used 0.
    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.unusedSessions).toBe(3);
    expect(result[0]?.bookedSessions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deleted plan (totalSessions = null)
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — deleted plan (totalSessions = null)', () => {
  it('returns unusedSessions = 0 when plan no longer exists in catalog', async () => {
    const rows = [makeUsageRow({ totalSessions: null, attended: 1, pendingScheduling: 0 })];
    const useCase = buildUseCase(rows);

    // unusedSessions cannot be computed → 0, pendingRows = 0 → row excluded
    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(0);
  });

  it('includes deleted plan when pendingRows > 0 despite null totalSessions', async () => {
    const rows = [makeUsageRow({ totalSessions: null, attended: 1, pendingScheduling: 2 })];
    const useCase = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.totalSessions).toBeNull();
    expect(result[0]?.unusedSessions).toBe(0);
    expect(result[0]?.pendingRows).toBe(2);
    expect(result[0]?.hasPendingRows).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multiple plans
// ---------------------------------------------------------------------------

describe('GetUnusedPackageSessionsUseCase — multiple plans', () => {
  it('returns only plans with unused sessions or pending rows from a mixed list', async () => {
    const rows = [
      // Fully used — excluded
      makeUsageRow({ planName: 'Paquete A', totalSessions: 3, attended: 3, pendingScheduling: 0 }),
      // $240 case — included
      makeUsageRow({ planName: 'Paquete B', totalSessions: 3, attended: 1, pendingScheduling: 0 }),
      // Happy path — included
      makeUsageRow({ planName: 'Paquete C', totalSessions: 5, attended: 2, pendingScheduling: 2 }),
    ];
    const useCase = buildUseCase(rows);

    const result = await useCase.execute(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.planName);
    expect(names).toContain('Paquete B');
    expect(names).toContain('Paquete C');
    expect(names).not.toContain('Paquete A');
  });
});
