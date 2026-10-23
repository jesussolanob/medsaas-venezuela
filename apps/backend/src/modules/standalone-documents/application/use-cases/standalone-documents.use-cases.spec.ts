import { StandaloneDocument } from '../../domain/entities/standalone-document.entity';
import { StandaloneDocumentNotFoundError } from '../../domain/errors/standalone-document-not-found.error';
import { StandaloneDocumentNotDraftError } from '../../domain/errors/standalone-document-not-draft.error';
import { StandaloneDocumentNotIssuedError } from '../../domain/errors/standalone-document-not-issued.error';
import { StandaloneDocumentCodeConflictError } from '../../domain/errors/standalone-document-code-conflict.error';
import { StandaloneDocumentCodeExhaustedError } from '../../domain/errors/standalone-document-code-exhausted.error';
import { PatientNotOwnedByDoctorError } from '../../domain/errors/patient-not-owned-by-doctor.error';
import type { IStandaloneDocumentRepository } from '../../domain/repositories/istandalone-document.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import { ListStandaloneDocumentsUseCase } from './list-standalone-documents.use-case';
import { GetStandaloneDocumentUseCase } from './get-standalone-document.use-case';
import { CreateStandaloneDocumentUseCase } from './create-standalone-document.use-case';
import { UpdateStandaloneDocumentUseCase } from './update-standalone-document.use-case';
import { DeleteStandaloneDocumentUseCase } from './delete-standalone-document.use-case';
import { IssueStandaloneDocumentUseCase } from './issue-standalone-document.use-case';
import { VoidStandaloneDocumentUseCase } from './void-standalone-document.use-case';
import { Patient } from '../../../patients/domain/entities/patient.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'eeeeeeee-0000-0000-0000-000000000002';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const DOC_ID = 'docDocDocDoc-0000-0000-0000-000000000001';

function makeDraft(): StandaloneDocument {
  return StandaloneDocument.create({
    id: DOC_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    type: 'recipe',
    code: null,
    status: 'draft',
    content: { medications: [], notes: '' },
    voidReason: null,
    issuedAt: null,
    voidedAt: null,
    createdAt: new Date('2026-10-22T00:00:00Z'),
    updatedAt: new Date('2026-10-22T00:00:00Z'),
  });
}

function makeIssued(): StandaloneDocument {
  return StandaloneDocument.create({
    ...makeDraft(),
    code: 'REC-202610-0001',
    status: 'issued',
    issuedAt: new Date('2026-10-22T10:00:00Z'),
  });
}

function mockDocRepo(): jest.Mocked<IStandaloneDocumentRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    findByIdWithPatient: jest.fn(),
    create: jest.fn(),
    updateContent: jest.fn(),
    persistIssued: jest.fn(),
    persistVoided: jest.fn(),
    delete: jest.fn(),
    getMaxSequenceForMonth: jest.fn(),
  } as jest.Mocked<IStandaloneDocumentRepository>;
}

function mockPatientRepo(): jest.Mocked<IPatientRepository> {
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
  } as jest.Mocked<IPatientRepository>;
}

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// ListStandaloneDocumentsUseCase
// ---------------------------------------------------------------------------

describe('ListStandaloneDocumentsUseCase', () => {
  it('returns documents for the doctor', async () => {
    const repo = mockDocRepo();
    const summary = {
      id: DOC_ID,
      type: 'recipe' as const,
      code: null,
      status: 'draft' as const,
      patientId: PATIENT_ID,
      patientName: 'Juan Pérez',
      createdAt: new Date(),
      issuedAt: null,
      voidedAt: null,
    };
    repo.list.mockResolvedValue([summary]);
    const uc = new ListStandaloneDocumentsUseCase(repo);

    const result = await uc.execute(DOCTOR_ID, {});

    expect(repo.list).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      patientId: undefined,
      type: undefined,
      status: undefined,
    });
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GetStandaloneDocumentUseCase
// ---------------------------------------------------------------------------

describe('GetStandaloneDocumentUseCase', () => {
  it('returns the document detail when found', async () => {
    const repo = mockDocRepo();
    const detail = {
      document: makeDraft(),
      patient: { id: PATIENT_ID, fullName: 'Juan Pérez', cedula: 'V-12345678', age: 30 },
    };
    repo.findByIdWithPatient.mockResolvedValue(detail);
    const uc = new GetStandaloneDocumentUseCase(repo);

    const result = await uc.execute(DOC_ID, DOCTOR_ID);
    expect(result.document.id).toBe(DOC_ID);
  });

  it('throws StandaloneDocumentNotFoundError when not found', async () => {
    const repo = mockDocRepo();
    repo.findByIdWithPatient.mockResolvedValue(null);
    const uc = new GetStandaloneDocumentUseCase(repo);

    await expect(uc.execute(DOC_ID, DOCTOR_ID)).rejects.toBeInstanceOf(
      StandaloneDocumentNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// CreateStandaloneDocumentUseCase
// ---------------------------------------------------------------------------

describe('CreateStandaloneDocumentUseCase', () => {
  it('creates a draft when patient belongs to doctor', async () => {
    const docRepo = mockDocRepo();
    const patientRepo = mockPatientRepo();
    patientRepo.findById.mockResolvedValue(makePatient());
    docRepo.create.mockResolvedValue(makeDraft());
    const uc = new CreateStandaloneDocumentUseCase(docRepo, patientRepo);

    const result = await uc.execute(
      { type: 'recipe', patient_id: PATIENT_ID, content: { medications: [], notes: '' } },
      DOCTOR_ID,
    );

    expect(patientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    expect(result.status).toBe('draft');
  });

  it('throws PatientNotOwnedByDoctorError when patient not found', async () => {
    const docRepo = mockDocRepo();
    const patientRepo = mockPatientRepo();
    patientRepo.findById.mockResolvedValue(null);
    const uc = new CreateStandaloneDocumentUseCase(docRepo, patientRepo);

    await expect(
      uc.execute(
        { type: 'recipe', patient_id: PATIENT_ID, content: { medications: [], notes: '' } },
        DOCTOR_ID,
      ),
    ).rejects.toBeInstanceOf(PatientNotOwnedByDoctorError);
  });
});

// ---------------------------------------------------------------------------
// UpdateStandaloneDocumentUseCase
// ---------------------------------------------------------------------------

describe('UpdateStandaloneDocumentUseCase', () => {
  it('updates content of a draft document', async () => {
    const repo = mockDocRepo();
    const draft = makeDraft();
    repo.findById.mockResolvedValue(draft);
    repo.updateContent.mockResolvedValue(draft);
    const uc = new UpdateStandaloneDocumentUseCase(repo);

    await uc.execute(DOC_ID, DOCTOR_ID, { content: { medications: [], notes: 'Test' } });
    expect(repo.updateContent).toHaveBeenCalledWith(DOC_ID, { medications: [], notes: 'Test' });
  });

  it('throws StandaloneDocumentNotDraftError for issued document', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeIssued());
    const uc = new UpdateStandaloneDocumentUseCase(repo);

    await expect(
      uc.execute(DOC_ID, DOCTOR_ID, { content: { medications: [], notes: '' } }),
    ).rejects.toBeInstanceOf(StandaloneDocumentNotDraftError);
  });

  it('throws StandaloneDocumentNotFoundError for foreign doctor', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeDraft());
    const uc = new UpdateStandaloneDocumentUseCase(repo);

    await expect(
      uc.execute(DOC_ID, OTHER_DOCTOR, { content: { medications: [], notes: '' } }),
    ).rejects.toBeInstanceOf(StandaloneDocumentNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// DeleteStandaloneDocumentUseCase
// ---------------------------------------------------------------------------

describe('DeleteStandaloneDocumentUseCase', () => {
  it('deletes a draft document', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeDraft());
    repo.delete.mockResolvedValue(undefined);
    const uc = new DeleteStandaloneDocumentUseCase(repo);

    await uc.execute(DOC_ID, DOCTOR_ID);
    expect(repo.delete).toHaveBeenCalledWith(DOC_ID);
  });

  it('throws StandaloneDocumentNotDraftError when trying to delete issued', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeIssued());
    const uc = new DeleteStandaloneDocumentUseCase(repo);

    await expect(uc.execute(DOC_ID, DOCTOR_ID)).rejects.toBeInstanceOf(
      StandaloneDocumentNotDraftError,
    );
  });
});

// ---------------------------------------------------------------------------
// IssueStandaloneDocumentUseCase
// ---------------------------------------------------------------------------

describe('IssueStandaloneDocumentUseCase', () => {
  it('issues a draft document with generated code', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeDraft());
    repo.getMaxSequenceForMonth.mockResolvedValue(0);
    repo.persistIssued.mockResolvedValue(makeIssued());
    const uc = new IssueStandaloneDocumentUseCase(repo);

    const result = await uc.execute(DOC_ID, DOCTOR_ID);

    expect(repo.persistIssued).toHaveBeenCalledWith(
      DOC_ID,
      expect.stringMatching(/^REC-\d{6}-\d{4,}$/),
      expect.any(Date),
    );
    expect(result.status).toBe('issued');
  });

  it('retries on code conflict and succeeds on second attempt', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeDraft());
    repo.getMaxSequenceForMonth.mockResolvedValue(0);
    // First attempt: conflict; second: success
    repo.persistIssued
      .mockRejectedValueOnce(new StandaloneDocumentCodeConflictError('REC-202610-0001'))
      .mockResolvedValueOnce(makeIssued());
    const uc = new IssueStandaloneDocumentUseCase(repo);

    const result = await uc.execute(DOC_ID, DOCTOR_ID);

    expect(repo.persistIssued).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('issued');
  });

  it('throws StandaloneDocumentCodeExhaustedError after MAX_RETRIES conflicts', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeDraft());
    repo.getMaxSequenceForMonth.mockResolvedValue(0);
    repo.persistIssued.mockRejectedValue(
      new StandaloneDocumentCodeConflictError('REC-202610-0001'),
    );
    const uc = new IssueStandaloneDocumentUseCase(repo);

    await expect(uc.execute(DOC_ID, DOCTOR_ID)).rejects.toBeInstanceOf(
      StandaloneDocumentCodeExhaustedError,
    );
  });

  it('throws StandaloneDocumentNotDraftError when already issued', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeIssued());
    const uc = new IssueStandaloneDocumentUseCase(repo);

    await expect(uc.execute(DOC_ID, DOCTOR_ID)).rejects.toBeInstanceOf(
      StandaloneDocumentNotDraftError,
    );
  });
});

// ---------------------------------------------------------------------------
// VoidStandaloneDocumentUseCase
// ---------------------------------------------------------------------------

describe('VoidStandaloneDocumentUseCase', () => {
  it('voids an issued document', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeIssued());
    const voided = StandaloneDocument.create({
      ...makeIssued(),
      status: 'voided',
      voidReason: 'Error',
      voidedAt: new Date(),
    });
    repo.persistVoided.mockResolvedValue(voided);
    const uc = new VoidStandaloneDocumentUseCase(repo);

    const result = await uc.execute(DOC_ID, DOCTOR_ID, { reason: 'Error' });

    expect(repo.persistVoided).toHaveBeenCalledWith(DOC_ID, 'Error', expect.any(Date));
    expect(result.status).toBe('voided');
  });

  it('throws StandaloneDocumentNotIssuedError when trying to void a draft', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeDraft());
    const uc = new VoidStandaloneDocumentUseCase(repo);

    await expect(uc.execute(DOC_ID, DOCTOR_ID, {})).rejects.toBeInstanceOf(
      StandaloneDocumentNotIssuedError,
    );
  });

  it('throws StandaloneDocumentNotFoundError for foreign doctor', async () => {
    const repo = mockDocRepo();
    repo.findById.mockResolvedValue(makeIssued());
    const uc = new VoidStandaloneDocumentUseCase(repo);

    await expect(uc.execute(DOC_ID, OTHER_DOCTOR, {})).rejects.toBeInstanceOf(
      StandaloneDocumentNotFoundError,
    );
  });
});
