import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateEhrRecordDtoSchema,
  UpdateEhrRecordDtoSchema,
  type CreateEhrRecordDto,
  type UpdateEhrRecordDto,
} from '@delta/shared-types';

import { CreateEhrRecordUseCase } from '../../application/use-cases/ehr/create-ehr-record.use-case';
import { GetPatientEhrUseCase } from '../../application/use-cases/ehr/get-patient-ehr.use-case';
import { UpdateEhrRecordUseCase } from '../../application/use-cases/ehr/update-ehr-record.use-case';
import { GetEhrByIdUseCase } from '../../application/use-cases/ehr/get-ehr-by-id.use-case';
import { toEhrRecordResponse } from '../mappers/ehr-record.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * EHR controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require DevAuthGuard (Etapa 1 only).
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 *
 * NOTE: Access for role 'patient' to EHR records is deferred to the
 * patient-portal module. All endpoints here are doctor-only.
 */
@Controller('ehr')
@UseGuards(DevAuthGuard)
export class EhrController {
  constructor(
    private readonly createRecord: CreateEhrRecordUseCase,
    private readonly getPatientEhr: GetPatientEhrUseCase,
    private readonly updateRecord: UpdateEhrRecordUseCase,
    private readonly getById: GetEhrByIdUseCase,
  ) {}

  /** GET /api/ehr/patient/:patientId — full EHR history for a patient. */
  @Get('patient/:patientId')
  async getPatientHistory(
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown[]>> {
    const records = await this.getPatientEhr.execute({
      patientId,
      doctorId: user.sub,
    });
    return { success: true, data: records.map(toEhrRecordResponse) };
  }

  /** GET /api/ehr/:id — single EHR record detail. */
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const record = await this.getById.execute({ ehrId: id, doctorId: user.sub });
    return { success: true, data: toEhrRecordResponse(record) };
  }

  /**
   * POST /api/ehr — create a new EHR record.
   *
   * doctor_id is taken from the authenticated user — the body's doctor_id field
   * is ignored to prevent IDOR.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateEhrRecordDtoSchema)) dto: CreateEhrRecordDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const record = await this.createRecord.execute({
      doctorId: user.sub,
      patientId: dto.patient_id,
      consultationId: dto.consultation_id ?? null,
      diagnosis: dto.diagnosis ?? null,
      treatmentPlan: dto.treatment_plan ?? null,
    });
    return { success: true, data: toEhrRecordResponse(record) };
  }

  /** PUT /api/ehr/:id — update clinical fields (partial). */
  @Put(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(UpdateEhrRecordDtoSchema)) dto: UpdateEhrRecordDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const record = await this.updateRecord.execute({
      ehrId: id,
      doctorId: user.sub,
      diagnosis: dto.diagnosis,
      treatmentPlan: dto.treatment_plan,
    });
    return { success: true, data: toEhrRecordResponse(record) };
  }
}
