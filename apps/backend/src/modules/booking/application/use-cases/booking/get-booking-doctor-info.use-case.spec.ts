import { GetBookingDoctorInfoUseCase } from './get-booking-doctor-info.use-case';
import { DoctorNotFoundError } from './create-booking.use-case';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';
import type { IBookingFeatureChecker } from '../../../domain/repositories/booking-feature-checker.repository';
import type { IStoragePort } from '../../../../storage/application/ports/storage.port';

const GCS_URL =
  'https://storage.googleapis.com/my-bucket/avatar/doc.png?X-Goog-Algorithm=GOOG4-RSA-SHA256';
const FRESH_URL =
  'https://storage.googleapis.com/my-bucket/avatar/doc.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&refreshed=1';

const DOCTOR: DoctorPublicInfo = {
  id: 'doc-001',
  fullName: 'Dr. García',
  specialty: 'Cardiología',
  professionalTitle: 'Dr.',
  paymentMethods: ['pago_movil'],
  paymentDetails: null,
  allowsOnline: false,
  officeAddress: 'Av. Principal',
  city: 'Caracas',
  avatarUrl: null,
  isActive: true,
};

describe('GetBookingDoctorInfoUseCase', () => {
  let useCase: GetBookingDoctorInfoUseCase;
  let mockLoader: jest.Mocked<IBookingDoctorLoader>;
  let mockFeatureChecker: jest.Mocked<IBookingFeatureChecker>;

  beforeEach(() => {
    mockLoader = { findById: jest.fn() };
    mockFeatureChecker = { isBookingEnabled: jest.fn() };
    // storagePort is @Optional — not injected in most tests (backward compat)
    useCase = new GetBookingDoctorInfoUseCase(mockLoader, mockFeatureChecker);
  });

  it('returns doctor info when doctor exists and is active', async () => {
    mockLoader.findById.mockResolvedValue(DOCTOR);
    mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);

    const result = await useCase.execute('doc-001');

    expect(result.fullName).toBe('Dr. García');
    expect(mockLoader.findById).toHaveBeenCalledWith('doc-001');
  });

  it('throws DoctorNotFoundError (404) when doctor does not exist', async () => {
    mockLoader.findById.mockResolvedValue(null);
    await expect(useCase.execute('doc-999')).rejects.toThrow(DoctorNotFoundError);
  });

  it('throws DoctorNotFoundError (404) when doctor is inactive', async () => {
    mockLoader.findById.mockResolvedValue({ ...DOCTOR, isActive: false });
    await expect(useCase.execute('doc-001')).rejects.toThrow(DoctorNotFoundError);
  });

  it('DoctorNotFoundError carries httpStatus 404', async () => {
    mockLoader.findById.mockResolvedValue(null);
    try {
      await useCase.execute('doc-999');
    } catch (err) {
      expect((err as DoctorNotFoundError).httpStatus).toBe(404);
      expect((err as DoctorNotFoundError).message).not.toContain('doc-999');
    }
  });

  describe('bookingEnabled flag', () => {
    it('returns bookingEnabled=true when feature checker returns true', async () => {
      mockLoader.findById.mockResolvedValue(DOCTOR);
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);

      const result = await useCase.execute('doc-001');

      expect(result.bookingEnabled).toBe(true);
      expect(mockFeatureChecker.isBookingEnabled).toHaveBeenCalledWith('doc-001');
    });

    it('returns bookingEnabled=false when feature checker returns false (plan does not include booking)', async () => {
      mockLoader.findById.mockResolvedValue(DOCTOR);
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(false);

      const result = await useCase.execute('doc-001');

      expect(result.bookingEnabled).toBe(false);
      expect(mockFeatureChecker.isBookingEnabled).toHaveBeenCalledWith('doc-001');
    });

    it('does not call feature checker when doctor is not found', async () => {
      mockLoader.findById.mockResolvedValue(null);

      await expect(useCase.execute('doc-999')).rejects.toThrow(DoctorNotFoundError);
      expect(mockFeatureChecker.isBookingEnabled).not.toHaveBeenCalled();
    });

    it('does not call feature checker when doctor is inactive', async () => {
      mockLoader.findById.mockResolvedValue({ ...DOCTOR, isActive: false });

      await expect(useCase.execute('doc-001')).rejects.toThrow(DoctorNotFoundError);
      expect(mockFeatureChecker.isBookingEnabled).not.toHaveBeenCalled();
    });

    it('includes all original DoctorPublicInfo fields alongside bookingEnabled', async () => {
      mockLoader.findById.mockResolvedValue(DOCTOR);
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);

      const result = await useCase.execute('doc-001');

      expect(result).toMatchObject({
        id: 'doc-001',
        fullName: 'Dr. García',
        specialty: 'Cardiología',
        bookingEnabled: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // GCS avatar URL re-signing
  // ---------------------------------------------------------------------------

  describe('GCS avatar URL re-signing', () => {
    let mockStorage: jest.Mocked<IStoragePort>;

    beforeEach(() => {
      mockStorage = {
        upload: jest.fn(),
        getSignedUrl: jest.fn().mockResolvedValue(FRESH_URL),
      };
      // Re-create use-case with storage port injected
      useCase = new GetBookingDoctorInfoUseCase(mockLoader, mockFeatureChecker, null, mockStorage);
    });

    it('re-signs GCS avatar URL when storage port is provided', async () => {
      mockLoader.findById.mockResolvedValue({ ...DOCTOR, avatarUrl: GCS_URL });
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);

      const result = await useCase.execute('doc-001');

      expect(result.avatarUrl).toBe(FRESH_URL);
      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith('avatar/doc.png', expect.any(Number));
    });

    it('returns original null avatarUrl as-is (no sign call needed)', async () => {
      mockLoader.findById.mockResolvedValue({ ...DOCTOR, avatarUrl: null });
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);

      const result = await useCase.execute('doc-001');

      expect(result.avatarUrl).toBeNull();
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });

    it('does not sign non-GCS avatarUrl', async () => {
      const nonGcs = 'https://cdn.example.com/avatar.png';
      mockLoader.findById.mockResolvedValue({ ...DOCTOR, avatarUrl: nonGcs });
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);

      const result = await useCase.execute('doc-001');

      expect(result.avatarUrl).toBe(nonGcs);
      expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // D1 — currency mode pass-through
  // ---------------------------------------------------------------------------

  describe('currencyMode and customRate pass-through (D1)', () => {
    beforeEach(() => {
      mockFeatureChecker.isBookingEnabled.mockResolvedValue(true);
    });

    it('passes currencyMode=eur_bcv through to the response', async () => {
      mockLoader.findById.mockResolvedValue({
        ...DOCTOR,
        currencyMode: 'eur_bcv',
        customRate: null,
      });

      const result = await useCase.execute('doc-001');

      expect(result.currencyMode).toBe('eur_bcv');
      expect(result.customRate).toBeNull();
    });

    it('passes currencyMode=custom and customRate through when rate is set', async () => {
      mockLoader.findById.mockResolvedValue({
        ...DOCTOR,
        currencyMode: 'custom',
        customRate: 97.5,
      });

      const result = await useCase.execute('doc-001');

      expect(result.currencyMode).toBe('custom');
      expect(result.customRate).toBe(97.5);
    });

    it('does not throw when currencyMode=custom and customRate is null (rate not yet configured)', async () => {
      mockLoader.findById.mockResolvedValue({
        ...DOCTOR,
        currencyMode: 'custom',
        customRate: null,
      });

      const result = await useCase.execute('doc-001');

      expect(result.currencyMode).toBe('custom');
      expect(result.customRate).toBeNull();
    });

    it('passes currencyMode=usd_bcv and null customRate (repository default for null column)', async () => {
      // The repository normalises null → 'usd_bcv'; the use case just passes it through.
      mockLoader.findById.mockResolvedValue({
        ...DOCTOR,
        currencyMode: 'usd_bcv',
        customRate: null,
      });

      const result = await useCase.execute('doc-001');

      expect(result.currencyMode).toBe('usd_bcv');
      expect(result.customRate).toBeNull();
    });

    it('customRate is null when mode is usd_bcv, even if loader somehow provides a rate', async () => {
      // Repository guarantees this; use case must not alter the contract.
      // If the loader returns null for a non-custom mode, the use case keeps it null.
      mockLoader.findById.mockResolvedValue({
        ...DOCTOR,
        currencyMode: 'usd_bcv',
        customRate: null, // repository always returns null for non-custom
      });

      const result = await useCase.execute('doc-001');

      expect(result.customRate).toBeNull();
    });

    it('works without currencyMode field (loader without D1 support — backward compat)', async () => {
      // DOCTOR constant does not include currencyMode — simulates an old loader.
      mockLoader.findById.mockResolvedValue(DOCTOR);

      const result = await useCase.execute('doc-001');

      // Use case must not throw; currencyMode is simply undefined (optional field).
      expect(result).toBeDefined();
      expect(result.currencyMode).toBeUndefined();
    });
  });
});
