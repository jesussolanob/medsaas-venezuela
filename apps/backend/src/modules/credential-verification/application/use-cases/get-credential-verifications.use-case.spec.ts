import { GetCredentialVerificationsUseCase } from './get-credential-verifications.use-case';
import type { ICredentialVerificationRepository } from '../../domain/repositories/credential-verification.repository';
import { CredentialVerification } from '../../domain/entities/credential-verification.entity';

const DOCTOR_ID = 'aaaa1111-aaaa-1111-aaaa-111111111111';

const makeRecord = (status = 'verified') =>
  CredentialVerification.create({
    id: 'cccc3333-cccc-3333-cccc-333333333333',
    doctorId: DOCTOR_ID,
    credentialType: 'mpps',
    declaredValue: 'MPPS-12345',
    verifierId: 'bbbb2222-bbbb-2222-bbbb-222222222222',
    status: status as never,
    evidence: { fechaRegistro: '2010-01-01' },
    checkedAt: new Date('2024-06-01'),
    attempts: 2,
    lastError: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
  });

describe('GetCredentialVerificationsUseCase', () => {
  let repo: jest.Mocked<ICredentialVerificationRepository>;
  let useCase: GetCredentialVerificationsUseCase;

  beforeEach(() => {
    repo = {
      findByDoctorAndType: jest.fn(),
      findAllByDoctor: jest.fn(),
      upsert: jest.fn(),
    };
    useCase = new GetCredentialVerificationsUseCase(repo);
  });

  it('returns empty array when no records exist', async () => {
    repo.findAllByDoctor.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual([]);
    expect(repo.findAllByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns mapped output DTOs', async () => {
    const record = makeRecord('verified');
    repo.findAllByDoctor.mockResolvedValue([record]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(1);
    const item = result[0]!;
    expect(item.doctorId).toBe(DOCTOR_ID);
    expect(item.credentialType).toBe('mpps');
    expect(item.status).toBe('verified');
    expect(item.attempts).toBe(2);
    expect(item.evidence).toEqual({ fechaRegistro: '2010-01-01' });
    expect(item.lastError).toBeNull();
  });

  it('handles multiple records', async () => {
    repo.findAllByDoctor.mockResolvedValue([makeRecord('verified'), makeRecord('not_found')]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.status)).toEqual(['verified', 'not_found']);
  });
});
