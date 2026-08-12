import { TranscribeAudioUseCase } from './transcribe-audio.use-case';
import type { ITranscriptionPort } from '../ports/transcription.port';
import type { IAiRequestLogRepository } from '../../domain/repositories/ai-request-log.repository';
import type { IPlanFeaturesRepository } from '../../../doctor-settings/domain/repositories/plan-features.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { IPlanConfigRepository } from '../../../doctor-settings/domain/repositories/plan-config.repository';
import { TranscriptionFeatureDeniedError } from '../../domain/errors/transcription-feature-denied.error';
import { TranscriptionProviderError } from '../../domain/errors/transcription-provider-error';
import type { TranscribeAudioInputDto } from '../dtos/transcribe-audio.dto';
import { DoctorProfile } from '../../../doctor-settings/domain/entities/doctor-profile.entity';

const DOCTOR_ID = 'doc-uuid-0001';
const AUDIO_BUFFER = Buffer.from('fake-audio');
const AUDIO_BYTES = AUDIO_BUFFER.length;
const TEST_MODEL = 'gemini-2.5-flash';

function makeProfile(plan: string, subscriptionStatus: string): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Test',
    email: 'dr@test.com',
    specialty: null,
    professionalTitle: null,
    clinicId: null,
    clinicRole: null,
    paymentMethods: [],
    paymentDetails: {},
    allowsOnline: false,
    officeAddress: null,
    city: null,
    avatarUrl: null,
    plan,
    subscriptionStatus,
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    phone: null,
    currencyMode: 'usd_bcv',
    customRate: null,
    customRateLabel: null,
    cedula: null,
    birthDate: null,
    onboardingCompleted: true,
  });
}

const baseInput: TranscribeAudioInputDto = {
  audioBuffer: AUDIO_BUFFER,
  audioBytes: AUDIO_BYTES,
  mimeType: 'audio/webm',
  availableBlocks: [],
  language: 'es-VE',
  doctorId: DOCTOR_ID,
  isSuperAdmin: false,
};

const PLUS_FEATURES = [
  { featureKey: 'ai_transcription', featureLabel: 'Transcripción IA', enabled: true },
];
const FREE_FEATURES = [
  { featureKey: 'ai_transcription', featureLabel: 'Transcripción IA', enabled: false },
];
const BASE_CONFIG = {
  planKey: 'delta_plus',
  roleKey: 'doctor',
  isPermanent: false,
  isActive: true,
};
const FREE_CONFIG = { planKey: 'delta_free', roleKey: 'doctor', isPermanent: true, isActive: true };

describe('TranscribeAudioUseCase', () => {
  let useCase: TranscribeAudioUseCase;
  let mockTranscriptionPort: jest.Mocked<ITranscriptionPort>;
  let mockLogRepo: jest.Mocked<IAiRequestLogRepository>;
  let mockFeaturesRepo: jest.Mocked<IPlanFeaturesRepository>;
  let mockProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  let mockPlanConfigRepo: jest.Mocked<IPlanConfigRepository>;

  beforeEach(() => {
    mockTranscriptionPort = { transcribe: jest.fn() };
    mockLogRepo = { save: jest.fn().mockResolvedValue(undefined) };
    mockFeaturesRepo = { findByPlan: jest.fn() };
    mockProfileRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
      markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
      updateBlocksLayout: jest.fn().mockResolvedValue(undefined),
      countUpcomingAppointments: jest.fn().mockResolvedValue(0),
      deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
      findPlanSnapshot: jest.fn().mockResolvedValue(null),
      scheduleOwnAccountDeactivation: jest.fn().mockResolvedValue(undefined),
      applyExpiredScheduledDeactivations: jest.fn().mockResolvedValue(0),
    };
    mockPlanConfigRepo = { findByKey: jest.fn(), findPermanentPlanForRole: jest.fn() };

    useCase = new TranscribeAudioUseCase(
      mockTranscriptionPort,
      mockLogRepo,
      mockFeaturesRepo,
      mockProfileRepo,
      mockPlanConfigRepo,
    );
  });

  // -----------------------------------------------------------------------
  // Happy path — doctor with ai_transcription feature enabled
  // -----------------------------------------------------------------------

  it('transcribes audio and returns transcript when plan includes feature', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES);
    mockTranscriptionPort.transcribe.mockResolvedValue({
      transcript: 'Paciente refiere dolor...',
      suggestions: [{ block_key: 'chief_complaint', content: 'Dolor abdominal' }],
      model: TEST_MODEL,
    });

    const result = await useCase.execute(baseInput);

    expect(result.transcript).toBe('Paciente refiere dolor...');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.block_key).toBe('chief_complaint');
  });

  it('writes audit log with model name on success', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES);
    mockTranscriptionPort.transcribe.mockResolvedValue({
      transcript: 'text',
      suggestions: [],
      model: TEST_MODEL,
    });

    await useCase.execute(baseInput);

    expect(mockLogRepo.save).toHaveBeenCalledTimes(1);
    expect(mockLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        feature: 'transcription',
        status: 'success',
        model: TEST_MODEL,
      }),
    );
  });

  it('returns empty suggestions when none provided by port', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES);
    mockTranscriptionPort.transcribe.mockResolvedValue({
      transcript: 'Solo transcripción',
      suggestions: [],
      model: TEST_MODEL,
    });

    const result = await useCase.execute(baseInput);

    expect(result.suggestions).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // super_admin bypasses plan gate
  // -----------------------------------------------------------------------

  it('allows super_admin without checking plan', async () => {
    mockTranscriptionPort.transcribe.mockResolvedValue({
      transcript: 'admin text',
      suggestions: [],
      model: TEST_MODEL,
    });

    const result = await useCase.execute({ ...baseInput, isSuperAdmin: true });

    expect(result.transcript).toBe('admin text');
    expect(mockProfileRepo.findByDoctorId).not.toHaveBeenCalled();
    expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Plan gate — feature disabled
  // -----------------------------------------------------------------------

  it('throws TranscriptionFeatureDeniedError when feature is disabled for plan', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_free', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(
      TranscriptionFeatureDeniedError,
    );
  });

  it('denies when feature is absent from plan features list', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_base', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue({
      planKey: 'delta_base',
      roleKey: 'doctor',
      isPermanent: false,
      isActive: true,
    });
    mockFeaturesRepo.findByPlan.mockResolvedValue([
      { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
    ]);

    await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(
      TranscriptionFeatureDeniedError,
    );
  });

  // -----------------------------------------------------------------------
  // Lazy downgrade — subscription expired
  // -----------------------------------------------------------------------

  it('downgrades expired subscription and denies if free plan lacks feature', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'past_due'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

    await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(
      TranscriptionFeatureDeniedError,
    );
    expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledWith('delta_free');
  });

  it('allows doctor after downgrade if permanent plan includes feature', async () => {
    const freeWithAi = [
      { featureKey: 'ai_transcription', featureLabel: 'Transcripción IA', enabled: true },
    ];
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'past_due'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(FREE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(freeWithAi);
    mockTranscriptionPort.transcribe.mockResolvedValue({
      transcript: 'ok',
      suggestions: [],
      model: TEST_MODEL,
    });

    const result = await useCase.execute(baseInput);

    expect(result.transcript).toBe('ok');
  });

  // -----------------------------------------------------------------------
  // Fail-closed: plan check error → deny (not 500)
  // -----------------------------------------------------------------------

  it('denies with plan_check_failed when profile repo throws', async () => {
    mockProfileRepo.findByDoctorId.mockRejectedValue(new Error('DB connection lost'));

    const err = await useCase.execute(baseInput).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TranscriptionFeatureDeniedError);
    expect((err as TranscriptionFeatureDeniedError).code).toBe('TRANSCRIPTION_FEATURE_DENIED');
    expect((err as TranscriptionFeatureDeniedError).httpStatus).toBe(403);
  });

  it('denies with plan_check_failed when features repo throws', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockRejectedValue(new Error('timeout'));

    const err = await useCase.execute(baseInput).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TranscriptionFeatureDeniedError);
  });

  it('denies when doctor profile is not found', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(null);

    const err = await useCase.execute(baseInput).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TranscriptionFeatureDeniedError);
  });

  // -----------------------------------------------------------------------
  // Transcription port error → writes error audit log and rethrows
  // -----------------------------------------------------------------------

  it('writes error audit log when transcription port fails', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES);
    mockTranscriptionPort.transcribe.mockRejectedValue(new TranscriptionProviderError('HTTP 503'));

    await expect(useCase.execute(baseInput)).rejects.toBeInstanceOf(TranscriptionProviderError);
    expect(mockLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  // -----------------------------------------------------------------------
  // Audit log failures do not break the flow
  // -----------------------------------------------------------------------

  it('does not throw when audit log save fails', async () => {
    mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
    mockPlanConfigRepo.findByKey.mockResolvedValue(BASE_CONFIG);
    mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES);
    mockTranscriptionPort.transcribe.mockResolvedValue({
      transcript: 'ok',
      suggestions: [],
      model: TEST_MODEL,
    });
    mockLogRepo.save.mockRejectedValue(new Error('DB insert failed'));

    await expect(useCase.execute(baseInput)).resolves.toMatchObject({ transcript: 'ok' });
  });
});
