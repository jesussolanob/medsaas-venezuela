import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreatePatientDtoSchema,
  type CreatePatientDto,
  UpdatePatientDtoSchema,
  type UpdatePatientDto,
} from '@delta/shared-types';

import { CreatePatientUseCase } from '../../application/use-cases/patients/create-patient.use-case';
import { GetPatientUseCase } from '../../application/use-cases/patients/get-patient.use-case';
import { ListPatientsUseCase } from '../../application/use-cases/patients/list-patients.use-case';
import { SearchPatientsUseCase } from '../../application/use-cases/patients/search-patients.use-case';
import { UpdatePatientUseCase } from '../../application/use-cases/patients/update-patient.use-case';
import { DeletePatientUseCase } from '../../application/use-cases/patients/delete-patient.use-case';
import { toPatientListItem, toPatientDetail } from '../mappers/patient.mapper';
import { type PatientSource } from '../../domain/entities/patient.entity';

const VALID_SOURCES: ReadonlyArray<PatientSource> = ['booking', 'manual', 'import', 'invitation'];

/** Coerces a free-text source string to a typed PatientSource; null for unknown values. */
function toPatientSource(raw: string | null | undefined): PatientSource | null {
  if (!raw) return null;
  const found = VALID_SOURCES.find((s) => s === raw);
  return found ?? null;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; page: number; limit: number };
}

/**
 * Patients controller.
 *
 * All endpoints require AppAuthGuard.
 * Global prefix 'api' is set in main.ts.
 *
 * PII POLICY: All endpoints are owner-scoped (doctorId from auth token, never from request
 * body — anti-IDOR). PII is returned in plaintext to the owning doctor; masking has been removed.
 * GET /:id inserts one access_audit_log row (fieldRevealed='full_record').
 * List and search do NOT insert audit rows.
 */
@Controller('patients')
@UseGuards(AppAuthGuard)
export class PatientsController {
  constructor(
    private readonly createPatient: CreatePatientUseCase,
    private readonly getPatient: GetPatientUseCase,
    private readonly listPatients: ListPatientsUseCase,
    private readonly searchPatients: SearchPatientsUseCase,
    private readonly updatePatient: UpdatePatientUseCase,
    private readonly deletePatient: DeletePatientUseCase,
  ) {}

  /** GET /api/patients — paginated list with plaintext PII for the owning doctor. */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('source') source?: string,
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.listPatients.execute({
      doctorId: user.sub,
      source,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      // List shape: minimal fields only — no clinical data (allergies, chronicConditions, notes)
      data: result.items.map(toPatientListItem),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /** GET /api/patients/search?q= — hybrid search (cédula hash or name substring). */
  @Get('search')
  async search(
    @CurrentUser() user: CurrentUserPayload,
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<PaginatedResponse<unknown>> {
    const result = await this.searchPatients.execute({
      query: q,
      doctorId: user.sub,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });

    return {
      success: true,
      // Search results use the same minimal list shape
      data: result.items.map(toPatientListItem),
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * GET /api/patients/:id — single patient full detail (plaintext PII).
   *
   * Inserts one access_audit_log row with fieldRevealed='full_record'.
   * Actor IP is taken from x-forwarded-for (first value) with fallback to socket address.
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ): Promise<SuccessResponse<unknown>> {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      null;
    const userAgent = req.headers['user-agent'] ?? null;

    const patient = await this.getPatient.execute({
      patientId: id,
      doctorId: user.sub,
      actorId: user.sub,
      actorRole: user.role,
      ipAddress: ip,
      userAgent,
    });
    return { success: true, data: toPatientDetail(patient) };
  }

  /**
   * POST /api/patients — create a patient.
   *
   * doctor_id is taken from the authenticated user to prevent IDOR.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreatePatientDtoSchema)) dto: CreatePatientDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const patient = await this.createPatient.execute({
      // doctor_id always comes from the authenticated user — anti-IDOR
      doctorId: user.sub,
      fullName: dto.full_name,
      cedula: dto.cedula,
      phone: dto.phone,
      email: dto.email,
      source: toPatientSource(dto.source),
      birthDate: dto.birth_date,
      age: dto.age,
      sex: dto.sex,
      authUserId: dto.auth_user_id,
      // Datos demográficos/ubicación/clínicos/contacto de emergencia — se perdían al
      // CREAR porque el handler no los mapeaba (el use-case + entity + repo ya los persisten;
      // el handler PUT/update sí los mapeaba). Ahora se guardan también al crear.
      bloodType: dto.blood_type,
      allergies: dto.allergies,
      chronicConditions: dto.chronic_conditions,
      address: dto.address,
      city: dto.city,
      emergencyContactName: dto.emergency_contact_name,
      emergencyContactPhone: dto.emergency_contact_phone,
      emergencyContactRelationship: dto.emergency_contact_relationship,
      notes: dto.notes,
    });
    // POST returns minimal list shape — same as GET / so the caller can merge into its list
    return { success: true, data: toPatientListItem(patient) };
  }

  /** PUT /api/patients/:id — update patient fields (partial update, validated). */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePatientDtoSchema)) dto: UpdatePatientDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const patient = await this.updatePatient.execute({
      patientId: id,
      doctorId: user.sub,
      fullName: dto.full_name,
      cedula: dto.cedula,
      phone: dto.phone,
      email: dto.email,
      source: toPatientSource(dto.source),
      birthDate: dto.birth_date,
      age: dto.age,
      sex: dto.sex,
      bloodType: dto.blood_type,
      allergies: dto.allergies,
      chronicConditions: dto.chronic_conditions,
      address: dto.address,
      city: dto.city,
      emergencyContactName: dto.emergency_contact_name,
      emergencyContactPhone: dto.emergency_contact_phone,
      emergencyContactRelationship: dto.emergency_contact_relationship,
      notes: dto.notes,
    });
    // PUT returns detail shape (includes clinical fields the caller just sent)
    return { success: true, data: toPatientDetail(patient) };
  }

  /** DELETE /api/patients/:id — soft delete. */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<null>> {
    await this.deletePatient.execute({ patientId: id, doctorId: user.sub });
    return { success: true, data: null };
  }
}
