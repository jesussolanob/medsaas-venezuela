import { Test, TestingModule } from '@nestjs/testing';
import { PackagesController } from './packages.controller';
import { CreatePackageUseCase } from '../../application/use-cases/packages/create-package.use-case';
import { GetPatientPackagesUseCase } from '../../application/use-cases/packages/get-patient-packages.use-case';
import { GetDoctorPackagesUseCase } from '../../application/use-cases/packages/get-doctor-packages.use-case';
import { PatientPackage } from '../../domain/entities/patient-package.entity';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';

const makePkg = (id = 'pkg-001') =>
  PatientPackage.create({
    id,
    doctorId: 'doc-001',
    patientId: 'pat-001',
    planName: 'Paquete 10',
    totalSessions: 10,
    usedSessions: 0,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mockUser = { sub: 'doc-001', role: 'doctor' as const, email: 'doc@test.com' };

describe('PackagesController', () => {
  let controller: PackagesController;
  let mockCreateUseCase: jest.Mocked<CreatePackageUseCase>;
  let mockGetUseCase: jest.Mocked<GetPatientPackagesUseCase>;
  let mockGetDoctorPackagesUseCase: jest.Mocked<GetDoctorPackagesUseCase>;

  beforeEach(async () => {
    mockCreateUseCase = { execute: jest.fn() } as unknown as jest.Mocked<CreatePackageUseCase>;
    mockGetUseCase = { execute: jest.fn() } as unknown as jest.Mocked<GetPatientPackagesUseCase>;
    mockGetDoctorPackagesUseCase = { execute: jest.fn() } as unknown as jest.Mocked<GetDoctorPackagesUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PackagesController],
      providers: [
        { provide: CreatePackageUseCase, useValue: mockCreateUseCase },
        { provide: GetPatientPackagesUseCase, useValue: mockGetUseCase },
        { provide: GetDoctorPackagesUseCase, useValue: mockGetDoctorPackagesUseCase },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PackagesController>(PackagesController);
  });

  describe('listForDoctor', () => {
    it('returns all packages for the authenticated doctor', async () => {
      mockGetDoctorPackagesUseCase.execute.mockResolvedValue([makePkg()]);

      const response = await controller.listForDoctor(mockUser);

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(mockGetDoctorPackagesUseCase.execute).toHaveBeenCalledWith({
        doctorId: 'doc-001',
        patientId: null,
        status: null,
      });
    });

    it('passes optional patient_id filter', async () => {
      mockGetDoctorPackagesUseCase.execute.mockResolvedValue([]);

      await controller.listForDoctor(mockUser, 'pat-001');

      expect(mockGetDoctorPackagesUseCase.execute).toHaveBeenCalledWith({
        doctorId: 'doc-001',
        patientId: 'pat-001',
        status: null,
      });
    });

    it('passes optional status filter', async () => {
      mockGetDoctorPackagesUseCase.execute.mockResolvedValue([]);

      await controller.listForDoctor(mockUser, undefined, 'active');

      expect(mockGetDoctorPackagesUseCase.execute).toHaveBeenCalledWith({
        doctorId: 'doc-001',
        patientId: null,
        status: 'active',
      });
    });

    it('serializes packages with remainingSessions computed', async () => {
      mockGetDoctorPackagesUseCase.execute.mockResolvedValue([makePkg()]);

      const response = await controller.listForDoctor(mockUser);

      const item = response.data[0]!;
      expect(item.remainingSessions).toBe(10); // totalSessions - usedSessions = 10 - 0
      expect(item.totalSessions).toBe(10);
      expect(item.usedSessions).toBe(0);
    });
  });

  describe('listForPatient', () => {
    it('returns packages for the patient scoped to the authenticated doctor', async () => {
      mockGetUseCase.execute.mockResolvedValue([makePkg()]);

      const response = await controller.listForPatient('pat-001', mockUser);

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
      expect(mockGetUseCase.execute).toHaveBeenCalledWith({
        patientId: 'pat-001',
        doctorId: 'doc-001',
      });
    });

    it('returns empty array when patient has no packages', async () => {
      mockGetUseCase.execute.mockResolvedValue([]);
      const response = await controller.listForPatient('pat-999', mockUser);
      expect(response.data).toEqual([]);
    });
  });

  describe('create', () => {
    it('creates a package with doctorId from user.sub (not body)', async () => {
      mockCreateUseCase.execute.mockResolvedValue(makePkg());

      const dto = {
        patient_id: 'pat-001',
        plan_name: 'Paquete 10',
        total_sessions: 10,
      };
      const response = await controller.create(dto, mockUser);

      expect(response.success).toBe(true);
      expect(mockCreateUseCase.execute).toHaveBeenCalledWith(dto, 'doc-001');
    });
  });
});
