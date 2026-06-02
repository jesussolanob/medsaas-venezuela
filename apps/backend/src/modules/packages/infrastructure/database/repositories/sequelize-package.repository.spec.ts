import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { SequelizePackageRepository } from './sequelize-package.repository';
import { PatientPackageModel } from '../models/patient-package.model';
import { PatientModel } from '../../../../patients/infrastructure/database/models/patient.model';
import { Sequelize } from 'sequelize-typescript';

const mockPackageModel = {
  findByPk: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
};

const mockPatientModel = {
  findOne: jest.fn(),
};

const mockSequelize = {
  query: jest.fn(),
};

const PACKAGE_ROW = {
  id: 'pkg-001',
  doctorId: 'doc-001',
  patientId: 'pat-001',
  authUserId: null,
  packageTemplateId: null,
  planName: 'Paquete 10 sesiones',
  specialty: null,
  totalSessions: 10,
  usedSessions: 3,
  status: 'active',
  purchasedAmountUsd: null,
  notifiedOneLeft: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('SequelizePackageRepository', () => {
  let repo: SequelizePackageRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequelizePackageRepository,
        { provide: getModelToken(PatientPackageModel), useValue: mockPackageModel },
        { provide: getModelToken(PatientModel), useValue: mockPatientModel },
        { provide: Sequelize, useValue: mockSequelize },
      ],
    }).compile();

    repo = module.get(SequelizePackageRepository);
  });

  describe('findById', () => {
    it('returns a domain entity when found', async () => {
      mockPackageModel.findByPk.mockResolvedValue(PACKAGE_ROW);
      const pkg = await repo.findById('pkg-001');
      expect(pkg).not.toBeNull();
      expect(pkg!.id).toBe('pkg-001');
      expect(pkg!.usedSessions).toBe(3);
    });

    it('returns null when not found', async () => {
      mockPackageModel.findByPk.mockResolvedValue(null);
      const pkg = await repo.findById('not-found');
      expect(pkg).toBeNull();
    });
  });

  describe('findByPatientId', () => {
    it('returns packages for a patient scoped to doctor', async () => {
      mockPackageModel.findAll.mockResolvedValue([PACKAGE_ROW]);
      const pkgs = await repo.findByPatientId('pat-001', 'doc-001');
      expect(pkgs).toHaveLength(1);
      expect(mockPackageModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { patientId: 'pat-001', doctorId: 'doc-001' } }),
      );
    });
  });

  describe('findActiveByEmailHash', () => {
    it('returns active packages when patient found by email hash', async () => {
      mockPatientModel.findOne.mockResolvedValue({ id: 'pat-001' });
      mockPackageModel.findAll.mockResolvedValue([PACKAGE_ROW]);

      const pkgs = await repo.findActiveByEmailHash('hash-abc', 'doc-001');
      expect(pkgs).toHaveLength(1);
      expect(mockPackageModel.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { patientId: 'pat-001', doctorId: 'doc-001', status: 'active' },
        }),
      );
    });

    it('returns empty array when no patient found for email hash', async () => {
      mockPatientModel.findOne.mockResolvedValue(null);
      const pkgs = await repo.findActiveByEmailHash('hash-unknown', 'doc-001');
      expect(pkgs).toHaveLength(0);
      expect(mockPackageModel.findAll).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('creates and returns the domain entity', async () => {
      mockPackageModel.create.mockResolvedValue(PACKAGE_ROW);
      const input = {
        id: 'pkg-001',
        doctorId: 'doc-001',
        patientId: 'pat-001',
        authUserId: null,
        packageTemplateId: null,
        planName: 'Paquete 10 sesiones',
        specialty: null,
        totalSessions: 10,
        usedSessions: 0,
        status: 'active' as const,
        purchasedAmountUsd: null,
        notifiedOneLeft: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const saved = await repo.save(
        // PatientPackage.create would import domain — use a plain object matching the interface
        {
          ...input,
        } as unknown as import('../../../domain/entities/patient-package.entity').PatientPackage,
      );
      expect(saved.id).toBe('pkg-001');
    });
  });

  describe('consumeSessionOptimistic', () => {
    it('returns true when UPDATE affects 1 row', async () => {
      // QueryTypes.UPDATE returns [undefined, affectedCount: number].
      mockSequelize.query.mockResolvedValue([undefined, 1]);
      const result = await repo.consumeSessionOptimistic('pkg-001', 3);
      expect(result).toBe(true);
      expect(mockSequelize.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE patient_packages'),
        expect.objectContaining({
          replacements: { packageId: 'pkg-001', currentUsedSessions: 3 },
          type: QueryTypes.UPDATE,
        }),
      );
    });

    it('returns false when UPDATE affects 0 rows (concurrent modification)', async () => {
      mockSequelize.query.mockResolvedValue([undefined, 0]);
      const result = await repo.consumeSessionOptimistic('pkg-001', 3);
      expect(result).toBe(false);
    });
  });
});
