import { GetBookingDoctorInfoUseCase } from './get-booking-doctor-info.use-case';
import { DoctorNotFoundError } from './create-booking.use-case';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';
import type { IBookingFeatureChecker } from '../../../domain/repositories/booking-feature-checker.repository';

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
});
