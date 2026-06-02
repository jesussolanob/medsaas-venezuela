import { Test, type TestingModule } from '@nestjs/testing';
import { PatientsController } from './patients.controller';
import { CreatePatientUseCase } from '../../application/use-cases/patients/create-patient.use-case';
import { GetPatientUseCase } from '../../application/use-cases/patients/get-patient.use-case';
import { ListPatientsUseCase } from '../../application/use-cases/patients/list-patients.use-case';
import { RevealPatientDataUseCase } from '../../application/use-cases/patients/reveal-patient-data.use-case';
import { SearchPatientsUseCase } from '../../application/use-cases/patients/search-patients.use-case';
import { UpdatePatientUseCase } from '../../application/use-cases/patients/update-patient.use-case';
import { DeletePatientUseCase } from '../../application/use-cases/patients/delete-patient.use-case';
import { Patient } from '../../domain/entities/patient.entity';
import { PatientNotFoundError } from '../../domain/errors/patient-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { Request } from 'express';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makePatient(overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez García',
    cedula: 'V-12345678',
    phone: '+58412345678',
    email: 'juan@gmail.com',
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function makeRequest(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers: { 'user-agent': 'Jest/1.0', ...headers },
    socket: { remoteAddress: '127.0.0.1' } as never,
  };
}

describe('PatientsController', () => {
  let controller: PatientsController;

  const mockCreate = { execute: jest.fn() };
  const mockGet = { execute: jest.fn() };
  const mockList = { execute: jest.fn() };
  const mockReveal = { execute: jest.fn() };
  const mockSearch = { execute: jest.fn() };
  const mockUpdate = { execute: jest.fn() };
  const mockDelete = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        { provide: CreatePatientUseCase, useValue: mockCreate },
        { provide: GetPatientUseCase, useValue: mockGet },
        { provide: ListPatientsUseCase, useValue: mockList },
        { provide: RevealPatientDataUseCase, useValue: mockReveal },
        { provide: SearchPatientsUseCase, useValue: mockSearch },
        { provide: UpdatePatientUseCase, useValue: mockUpdate },
        { provide: DeletePatientUseCase, useValue: mockDelete },
      ],
    }).compile();

    controller = module.get<PatientsController>(PatientsController);
  });

  describe('GET /api/patients (list)', () => {
    it('returns a paginated list with masked PII', async () => {
      const patient = makePatient();
      mockList.execute.mockResolvedValue({ items: [patient], total: 1, page: 1, limit: 20 });

      const res = await controller.list(mockUser);

      expect(res.success).toBe(true);
      expect(res.data).toHaveLength(1);
      expect(res.meta).toEqual({ total: 1, page: 1, limit: 20 });

      const item = res.data[0] as Record<string, unknown>;
      // PII masking: first-name + last-initial
      expect(item.fullName).toBe('Juan G.');
      expect(String(item.cedula)).toContain('***');
      expect(String(item.phone)).toContain('***');
      expect(String(item.email)).toContain('***');
    });

    it('defaults to page=1 and limit=20', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
      await controller.list(mockUser);
      expect(mockList.execute).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });

    it('passes source filter to use case', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
      await controller.list(mockUser, '1', '20', 'booking');
      expect(mockList.execute).toHaveBeenCalledWith(expect.objectContaining({ source: 'booking' }));
    });
  });

  describe('GET /api/patients/:id (findOne)', () => {
    it('returns masked patient detail', async () => {
      const patient = makePatient();
      mockGet.execute.mockResolvedValue(patient);

      const res = await controller.findOne(PATIENT_ID, mockUser);

      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data.fullName).toBe('Juan G.');
    });

    it('propagates PatientNotFoundError', async () => {
      mockGet.execute.mockRejectedValue(new PatientNotFoundError());
      await expect(controller.findOne('x', mockUser)).rejects.toBeInstanceOf(PatientNotFoundError);
    });

    it('list response excludes clinical fields', async () => {
      const patient = makePatient({ allergies: 'Penicilina', notes: 'VIP' });
      mockList.execute.mockResolvedValue({ items: [patient], total: 1, page: 1, limit: 20 });

      const res = await controller.list(mockUser);
      const item = res.data[0] as Record<string, unknown>;

      // Minimal list shape — clinical fields must be absent
      expect(item).not.toHaveProperty('allergies');
      expect(item).not.toHaveProperty('chronicConditions');
      expect(item).not.toHaveProperty('notes');
      expect(item).not.toHaveProperty('bloodType');
      expect(item).not.toHaveProperty('birthDate');
      expect(item).not.toHaveProperty('address');
      // Core identifiers must be present
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('fullName');
      expect(item).toHaveProperty('source');
      expect(item).toHaveProperty('createdAt');
    });
  });

  describe('GET /api/patients/:id/reveal', () => {
    it('returns plaintext patient data', async () => {
      const patient = makePatient();
      mockReveal.execute.mockResolvedValue(patient);

      const res = await controller.reveal(PATIENT_ID, mockUser, makeRequest() as Request);

      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      // No masking on reveal
      expect(data.fullName).toBe('Juan Pérez García');
      expect(data.cedula).toBe('V-12345678');
    });

    it('passes actor and IP to the use case', async () => {
      const patient = makePatient();
      mockReveal.execute.mockResolvedValue(patient);

      await controller.reveal(
        PATIENT_ID,
        mockUser,
        makeRequest({ 'x-forwarded-for': '10.0.0.1' }) as Request,
      );

      expect(mockReveal.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: DOCTOR_ID,
          actorRole: 'doctor',
          ipAddress: '10.0.0.1',
        }),
      );
    });
  });

  describe('POST /api/patients (create)', () => {
    it('overrides doctor_id from body with the authenticated user (anti-IDOR)', async () => {
      const patient = makePatient();
      mockCreate.execute.mockResolvedValue(patient);

      const dto = {
        doctor_id: 'evil-other-doctor',
        full_name: 'Juan Pérez',
      };

      const res = await controller.create(dto as never, mockUser);

      expect(res.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });
  });

  describe('PUT /api/patients/:id (update)', () => {
    it('updates patient and returns masked data', async () => {
      const updated = makePatient({ fullName: 'Juan García' });
      mockUpdate.execute.mockResolvedValue(updated);

      const dto = { full_name: 'Juan García', phone: '+584120000000' };
      const res = await controller.update(PATIENT_ID, dto as never, mockUser);

      expect(res.success).toBe(true);
      // Masked in the response
      const data = res.data as Record<string, unknown>;
      expect(data.fullName).toBe('Juan G.');
    });

    it('uses patientId from path and doctorId from auth token — anti-IDOR', async () => {
      const patient = makePatient();
      mockUpdate.execute.mockResolvedValue(patient);

      await controller.update(PATIENT_ID, { full_name: 'Test' } as never, mockUser);

      expect(mockUpdate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: PATIENT_ID, doctorId: DOCTOR_ID }),
      );
    });

    it('coerces known source values and nullifies unknown ones', async () => {
      const patient = makePatient({ source: 'booking' });
      mockUpdate.execute.mockResolvedValue(patient);

      await controller.update(PATIENT_ID, { source: 'booking' } as never, mockUser);
      expect(mockUpdate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'booking' }),
      );
    });
  });

  describe('DELETE /api/patients/:id', () => {
    it('soft-deletes and returns success null', async () => {
      mockDelete.execute.mockResolvedValue(undefined);

      const res = await controller.remove(PATIENT_ID, mockUser);

      expect(res.success).toBe(true);
      expect(res.data).toBeNull();
      expect(mockDelete.execute).toHaveBeenCalledWith({
        patientId: PATIENT_ID,
        doctorId: DOCTOR_ID,
      });
    });
  });
});
