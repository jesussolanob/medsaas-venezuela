import { ResolveQuoteRecipientPatientUseCase } from './resolve-quote-recipient-patient.use-case';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { CreatePatientUseCase } from '../../../patients/application/use-cases/patients/create-patient.use-case';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { CryptoService } from '../../../../infrastructure/crypto/crypto.service';
import type { QuoteNewRecipient } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const EXISTING_PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const NEW_PATIENT_ID = 'pppppppp-0000-0000-0000-000000000002';
const now = new Date('2026-09-01T00:00:00Z');

const recipient: QuoteNewRecipient = {
  first_name: 'María',
  last_name: 'Pérez',
  email: 'maria@example.com',
  phone: '584141234567',
  cedula: 'V-12345678',
};

function makePatientRepo(): jest.Mocked<IPatientRepository> {
  return {
    findById: jest.fn(),
    findByCedulaHash: jest.fn(),
    findByEmailHash: jest.fn(),
    list: jest.fn(),
    findAllByDoctor: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    logReveal: jest.fn(),
  };
}

function makeCreatePatientUseCase(): jest.Mocked<CreatePatientUseCase> {
  return {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CreatePatientUseCase>;
}

function makeCrypto(): jest.Mocked<CryptoService> {
  return {
    encrypt: jest.fn((v: string) => `enc(${v})`),
    decrypt: jest.fn((v: string) => v),
    hashForSearch: jest.fn((v: string) => `hash(${v})`),
  } as unknown as jest.Mocked<CryptoService>;
}

function makePatient(overrides: Partial<ConstructorParameters<typeof Patient>[0]> = {}): Patient {
  return Patient.create({
    id: EXISTING_PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'María Pérez',
    cedula: 'V-12345678',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('ResolveQuoteRecipientPatientUseCase', () => {
  let patientRepo: jest.Mocked<IPatientRepository>;
  let createPatient: jest.Mocked<CreatePatientUseCase>;
  let crypto: jest.Mocked<CryptoService>;
  let uc: ResolveQuoteRecipientPatientUseCase;

  beforeEach(() => {
    patientRepo = makePatientRepo();
    createPatient = makeCreatePatientUseCase();
    crypto = makeCrypto();
    uc = new ResolveQuoteRecipientPatientUseCase(patientRepo, crypto, createPatient);
  });

  it('reuses the existing patient when the cédula is already on file — never creates a duplicate', async () => {
    patientRepo.findByCedulaHash.mockResolvedValueOnce(makePatient());

    const result = await uc.execute(DOCTOR_ID, recipient);

    expect(result).toBe(EXISTING_PATIENT_ID);
    expect(crypto.hashForSearch).toHaveBeenCalledWith('V-12345678');
    expect(patientRepo.findByCedulaHash).toHaveBeenCalledWith('hash(V-12345678)', DOCTOR_ID);
    expect(createPatient.execute).not.toHaveBeenCalled();
  });

  it('creates a new patient when the cédula does not exist for this doctor', async () => {
    patientRepo.findByCedulaHash.mockResolvedValueOnce(null);
    createPatient.execute.mockResolvedValueOnce(makePatient({ id: NEW_PATIENT_ID }));

    const result = await uc.execute(DOCTOR_ID, recipient);

    expect(result).toBe(NEW_PATIENT_ID);
    expect(createPatient.execute).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      fullName: 'María Pérez',
      cedula: 'V-12345678',
      phone: '584141234567',
      email: 'maria@example.com',
      source: 'manual',
    });
  });

  it('creates a new patient with a null email when new_recipient omits it', async () => {
    patientRepo.findByCedulaHash.mockResolvedValueOnce(null);
    createPatient.execute.mockResolvedValueOnce(makePatient({ id: NEW_PATIENT_ID }));

    await uc.execute(DOCTOR_ID, { ...recipient, email: null });

    expect(createPatient.execute).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it('cédula lookup is scoped to the doctor — reuse never crosses doctors', async () => {
    patientRepo.findByCedulaHash.mockResolvedValueOnce(null);
    createPatient.execute.mockResolvedValueOnce(makePatient({ id: NEW_PATIENT_ID }));

    await uc.execute(DOCTOR_ID, recipient);

    expect(patientRepo.findByCedulaHash).toHaveBeenCalledWith(expect.any(String), DOCTOR_ID);
  });
  /**
   * La huella de búsqueda no ignora guiones ni puntos, y el alta de pacientes
   * acepta la cédula como texto libre mientras este formulario exige V/E/P-<valor>.
   * Sin probar variantes, un paciente guardado como "12345678" quedaba invisible y
   * se le creaba un SEGUNDO registro. Medido en producción: 2 de 64 pacientes
   * estaban guardados así.
   */
  describe('cédula guardada con otro formato', () => {
    it('encuentra al paciente guardado solo con dígitos, sin crear otro', async () => {
      // La primera variante (tal cual se tipeó) no existe; la de solo dígitos sí.
      patientRepo.findByCedulaHash
        .mockResolvedValueOnce(null) // hash(V-12345678)
        .mockResolvedValueOnce(null) // hash(V12345678)
        .mockResolvedValueOnce(makePatient()); // hash(12345678)

      const result = await uc.execute(DOCTOR_ID, recipient);

      expect(result).toBe(EXISTING_PATIENT_ID);
      expect(createPatient.execute).not.toHaveBeenCalled();
      expect(crypto.hashForSearch).toHaveBeenCalledWith('12345678');
    });

    it('encuentra al paciente guardado con puntos', async () => {
      patientRepo.findByCedulaHash.mockResolvedValueOnce(null).mockResolvedValueOnce(makePatient()); // hash(V12345678) — "V-12.345.678" colapsa acá

      const result = await uc.execute(DOCTOR_ID, { ...recipient, cedula: 'V-12345678' });

      expect(result).toBe(EXISTING_PATIENT_ID);
      expect(createPatient.execute).not.toHaveBeenCalled();
      expect(crypto.hashForSearch).toHaveBeenCalledWith('V12345678');
    });

    it('corta en la primera coincidencia — no sigue consultando de más', async () => {
      patientRepo.findByCedulaHash.mockResolvedValueOnce(makePatient());

      await uc.execute(DOCTOR_ID, recipient);

      expect(patientRepo.findByCedulaHash).toHaveBeenCalledTimes(1);
    });

    it('si ninguna variante existe, crea el paciente una sola vez', async () => {
      patientRepo.findByCedulaHash.mockResolvedValue(null);
      createPatient.execute.mockResolvedValueOnce(makePatient({ id: NEW_PATIENT_ID }));

      const result = await uc.execute(DOCTOR_ID, recipient);

      expect(result).toBe(NEW_PATIENT_ID);
      expect(createPatient.execute).toHaveBeenCalledTimes(1);
      // Se guarda la cédula TAL CUAL la tipeó el especialista, en formato canónico.
      expect(createPatient.execute).toHaveBeenCalledWith(
        expect.objectContaining({ cedula: 'V-12345678' }),
      );
    });
  });
});
