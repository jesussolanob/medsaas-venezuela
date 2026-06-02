import { GetBookingDoctorInfoUseCase } from './get-booking-doctor-info.use-case';
import { DoctorNotFoundError } from './create-booking.use-case';
import type {
  IBookingDoctorLoader,
  DoctorPublicInfo,
} from '../../../domain/repositories/booking-doctor.repository';

const DOCTOR: DoctorPublicInfo = {
  id: 'doc-001',
  fullName: 'Dr. García',
  specialty: 'Cardiología',
  professionalTitle: 'Dr.',
  paymentMethods: ['pago_movil'],
  allowsOnline: false,
  officeAddress: 'Av. Principal',
  city: 'Caracas',
  avatarUrl: null,
  isActive: true,
};

describe('GetBookingDoctorInfoUseCase', () => {
  let useCase: GetBookingDoctorInfoUseCase;
  let mockLoader: jest.Mocked<IBookingDoctorLoader>;

  beforeEach(() => {
    mockLoader = { findById: jest.fn() };
    useCase = new GetBookingDoctorInfoUseCase(mockLoader);
  });

  it('returns doctor info when doctor exists and is active', async () => {
    mockLoader.findById.mockResolvedValue(DOCTOR);
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
});
