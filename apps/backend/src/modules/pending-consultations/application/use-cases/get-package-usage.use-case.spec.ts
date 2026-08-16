import { GetPackageUsageUseCase } from './get-package-usage.use-case';
import type {
  IPendingConsultationRepository,
  PackageUsageRow,
} from '../../domain/repositories/pending-consultation.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { PatientNotOwnedError } from '../../domain/errors/patient-not-owned.error';

const DOCTOR_ID = 'doc-uuid-1111-2222-3333-444444444444';
const PATIENT_ID = 'pat-uuid-1111-2222-3333-444444444444';
const PATIENT_ID_2 = 'pat-uuid-2222-3333-4444-555555555555';

function makePatient(id = PATIENT_ID): Patient {
  return Patient.create({
    id,
    doctorId: DOCTOR_ID,
    fullName: 'María García',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeRow(overrides: Partial<PackageUsageRow> = {}): PackageUsageRow {
  return {
    patientId: PATIENT_ID,
    planName: 'Terapia Completa',
    totalSessions: 6,
    attended: 2,
    scheduled: 1,
    noShow: 1,
    pendingScheduling: 2,
    ...overrides,
  };
}

function makePendingRepo(
  overrides: Partial<IPendingConsultationRepository> = {},
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
    getPackageUsage: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as jest.Mocked<IPendingConsultationRepository>;
}

function makePatientRepo(patient: Patient | null = makePatient()): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn().mockResolvedValue(patient),
    findByDoctorId: jest.fn(),
    findByCedulaHash: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    findByAuthUserId: jest.fn(),
  } as unknown as jest.Mocked<IPatientRepository>;
}

describe('GetPackageUsageUseCase', () => {
  let useCase: GetPackageUsageUseCase;
  let pendingRepo: jest.Mocked<IPendingConsultationRepository>;
  let patientRepo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    pendingRepo = makePendingRepo();
    patientRepo = makePatientRepo();
    useCase = new GetPackageUsageUseCase(pendingRepo, patientRepo);
  });

  // -------------------------------------------------------------------
  // Anti-IDOR — single patient mode
  // -------------------------------------------------------------------

  it('throws PatientNotOwnedError when the patient does not belong to the doctor', async () => {
    patientRepo = makePatientRepo(null);
    useCase = new GetPackageUsageUseCase(pendingRepo, patientRepo);

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID }),
    ).rejects.toBeInstanceOf(PatientNotOwnedError);

    expect(pendingRepo.getPackageUsage).not.toHaveBeenCalled();
  });

  it('calls getPackageUsage with doctorId and patientId when patient is owned', async () => {
    await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(patientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    expect(pendingRepo.getPackageUsage).toHaveBeenCalledWith(DOCTOR_ID, PATIENT_ID);
  });

  // -------------------------------------------------------------------
  // Bulk mode — no patientId
  // -------------------------------------------------------------------

  it('skips ownership check and calls getPackageUsage with undefined when patientId is absent', async () => {
    await useCase.execute({ doctorId: DOCTOR_ID });

    expect(patientRepo.findById).not.toHaveBeenCalled();
    expect(pendingRepo.getPackageUsage).toHaveBeenCalledWith(DOCTOR_ID, undefined);
  });

  it('returns rows for multiple patients in bulk mode', async () => {
    const rows = [
      makeRow({ patientId: PATIENT_ID, planName: 'Combo A', attended: 3 }),
      makeRow({ patientId: PATIENT_ID_2, planName: 'Combo B', attended: 1 }),
    ];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toHaveLength(2);
    expect(result[0]!.patientId).toBe(PATIENT_ID);
    expect(result[1]!.patientId).toBe(PATIENT_ID_2);
  });

  it('returns empty array when doctor has no patients with packages', async () => {
    pendingRepo.getPackageUsage.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------
  // Return value passthrough — single patient mode
  // -------------------------------------------------------------------

  it('returns empty array when patient has no packages', async () => {
    pendingRepo.getPackageUsage.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(result).toEqual([]);
  });

  it('returns the package usage rows from the repository', async () => {
    const rows = [makeRow()];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(result).toEqual(rows);
  });

  it('returns multiple plans when patient has more than one package', async () => {
    const rows = [
      makeRow({
        planName: 'Paquete A',
        totalSessions: 3,
        attended: 3,
        scheduled: 0,
        noShow: 0,
        pendingScheduling: 0,
      }),
      makeRow({
        planName: 'Paquete B',
        totalSessions: 5,
        attended: 1,
        scheduled: 2,
        noShow: 1,
        pendingScheduling: 1,
      }),
    ];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(result).toHaveLength(2);
    const [planA, planB] = result;
    expect(planA!.planName).toBe('Paquete A');
    expect(planB!.planName).toBe('Paquete B');
  });

  // -------------------------------------------------------------------
  // Business rule: no_show does NOT consume a session
  // -------------------------------------------------------------------

  it('returns no_show in its own bucket, not added to attended', async () => {
    const rows = [
      makeRow({
        planName: 'Combo',
        totalSessions: 4,
        attended: 1,
        scheduled: 0,
        noShow: 2,
        pendingScheduling: 1,
      }),
    ];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    const [combo] = result;
    expect(combo!.attended).toBe(1);
    expect(combo!.noShow).toBe(2);
    // attended + noShow is NOT totalSessions — noShow does not consume a session
    expect(combo!.attended + combo!.noShow).not.toBe(combo!.totalSessions);
  });

  // -------------------------------------------------------------------
  // Deleted plan (totalSessions: null)
  // -------------------------------------------------------------------

  it('returns totalSessions: null when the plan no longer exists in the catalog', async () => {
    const rows = [
      makeRow({
        planName: 'Plan eliminado',
        totalSessions: null,
        attended: 1,
        pendingScheduling: 2,
      }),
    ];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    const [deleted] = result;
    expect(deleted!.totalSessions).toBeNull();
  });

  // -------------------------------------------------------------------
  // patientId is always present in every row
  // -------------------------------------------------------------------

  it('includes patientId in every returned row', async () => {
    const rows = [makeRow({ patientId: PATIENT_ID })];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(result[0]!.patientId).toBe(PATIENT_ID);
  });

  // -------------------------------------------------------------------
  // Modo masivo (sin patientId) — lo usa la insignia de la lista de pacientes
  // -------------------------------------------------------------------

  it('no exige paciente: sin patientId devuelve el consumo de todos', async () => {
    const rows = [makeRow({ patientId: PATIENT_ID }), makeRow({ patientId: PATIENT_ID_2 })];
    pendingRepo.getPackageUsage.mockResolvedValue(rows);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result.map((r) => r.patientId)).toEqual([PATIENT_ID, PATIENT_ID_2]);
    expect(pendingRepo.getPackageUsage).toHaveBeenCalledWith(DOCTOR_ID, undefined);
  });

  it('sin patientId no valida ownership de nadie: el filtro por doctor ya acota', async () => {
    pendingRepo.getPackageUsage.mockResolvedValue([]);

    await useCase.execute({ doctorId: DOCTOR_ID });

    // Pedirle la ficha a un paciente que no se nombró no tendría sentido, y
    // hacerlo por cada paciente sería el N+1 que este modo viene a evitar.
    expect(patientRepo.findById).not.toHaveBeenCalled();
  });

  it('con patientId de otro doctor sigue reventando aunque exista el modo masivo', async () => {
    patientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID_2 })).rejects.toThrow(
      PatientNotOwnedError,
    );
    expect(pendingRepo.getPackageUsage).not.toHaveBeenCalled();
  });
});
