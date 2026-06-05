import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreatePackageDtoSchema, type CreatePackageDto } from '@delta/shared-types';
import { CreatePackageUseCase } from '../../application/use-cases/packages/create-package.use-case';
import { GetPatientPackagesUseCase } from '../../application/use-cases/packages/get-patient-packages.use-case';
import { GetDoctorPackagesUseCase } from '../../application/use-cases/packages/get-doctor-packages.use-case';
import type { PatientPackage } from '../../domain/entities/patient-package.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/** Serialized package row for API responses. */
interface PackageResponseItem {
  id: string;
  patientId: string | null;
  planName: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: string;
  purchasedAmountUsd: number | null;
  createdAt: string;
  updatedAt: string;
}

function toPackageResponse(pkg: PatientPackage): PackageResponseItem {
  return {
    id: pkg.id,
    patientId: pkg.patientId,
    planName: pkg.planName,
    totalSessions: pkg.totalSessions,
    usedSessions: pkg.usedSessions,
    remainingSessions: pkg.remainingSessions,
    status: pkg.status,
    purchasedAmountUsd: pkg.purchasedAmountUsd,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

/**
 * Packages controller — Etapa 1, doctor-only endpoints.
 *
 * All routes require DevAuthGuard; doctor_id is always taken from user.sub to
 * prevent cross-doctor IDOR via body injection.
 *
 * DEFERRED (not implemented):
 *   - DELETE /packages/:id (soft-cancel — not in Etapa 1 scope)
 */
@Controller('packages')
@UseGuards(DevAuthGuard)
export class PackagesController {
  constructor(
    private readonly createPackage: CreatePackageUseCase,
    private readonly getPatientPackages: GetPatientPackagesUseCase,
    private readonly getDoctorPackages: GetDoctorPackagesUseCase,
  ) {}

  /**
   * GET /api/packages/doctor
   * Returns all packages for the authenticated doctor (all patients).
   * Optional query params: ?patient_id=<uuid>&status=active|completed
   *
   * SECURITY: doctorId always taken from user.sub — cannot access other doctor's packages.
   */
  @Get('doctor')
  async listForDoctor(
    @CurrentUser() user: CurrentUserPayload,
    @Query('patient_id') patientId?: string,
    @Query('status') status?: 'active' | 'completed',
  ): Promise<SuccessResponse<PackageResponseItem[]>> {
    const packages = await this.getDoctorPackages.execute({
      doctorId: user.sub,
      patientId: patientId ?? null,
      status: status ?? null,
    });
    return { success: true, data: packages.map(toPackageResponse) };
  }

  /**
   * GET /api/packages/patient/:patientId
   * Returns all packages for a patient scoped to the authenticated doctor.
   */
  @Get('patient/:patientId')
  async listForPatient(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const packages = await this.getPatientPackages.execute({
      patientId,
      doctorId: user.sub,
    });
    return { success: true, data: packages };
  }

  /**
   * POST /api/packages
   * Creates a new pre-paid session package for a patient.
   * The doctor_id is taken from the authenticated session (user.sub).
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreatePackageDtoSchema)) dto: CreatePackageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const pkg = await this.createPackage.execute(dto, user.sub);
    return { success: true, data: pkg };
  }
}
