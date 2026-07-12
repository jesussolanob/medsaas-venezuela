import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { CreatePrescriptionDtoSchema, type CreatePrescriptionDto } from '@delta/shared-types';

import { CreatePrescriptionUseCase } from '../../application/use-cases/prescriptions/create-prescription.use-case';
import { GetPatientPrescriptionsUseCase } from '../../application/use-cases/prescriptions/get-patient-prescriptions.use-case';
import { GetPrescriptionByIdUseCase } from '../../application/use-cases/prescriptions/get-prescription-by-id.use-case';
import { toPrescriptionResponse } from '../mappers/prescription.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Prescriptions controller.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * SECURITY: doctor_id is ALWAYS taken from the authenticated user (user.sub).
 * Never trust doctor_id from the request body — anti-IDOR.
 *
 * DEFERRED endpoints (require additional infrastructure):
 *   - GET /:id/pdf — requires doctor_templates table (not yet created) and
 *     a PDF library decision. See TODO below.
 *
 * NOTE: access for role 'patient' to prescriptions is deferred to the
 * patient-portal module. All endpoints here are doctor-only.
 *
 * TODO: implement GET /api/prescriptions/:id/pdf when doctor_templates table
 * is available and PDF library (e.g., @react-pdf/renderer or pdfkit) is chosen.
 */
@Controller('prescriptions')
@UseGuards(AppAuthGuard)
export class PrescriptionsController {
  constructor(
    private readonly createPrescription: CreatePrescriptionUseCase,
    private readonly getPatientPrescriptions: GetPatientPrescriptionsUseCase,
    private readonly getById: GetPrescriptionByIdUseCase,
  ) {}

  /** GET /api/prescriptions/patient/:patientId — prescriptions for a patient. */
  @Get('patient/:patientId')
  async getPatientHistory(
    @Param('patientId', new ParseUUIDPipe({ version: '4' })) patientId: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown[]>> {
    const prescriptions = await this.getPatientPrescriptions.execute({
      patientId,
      doctorId: user.sub,
    });
    return { success: true, data: prescriptions.map(toPrescriptionResponse) };
  }

  /** GET /api/prescriptions/:id — single prescription detail. */
  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const prescription = await this.getById.execute({
      prescriptionId: id,
      doctorId: user.sub,
    });
    return { success: true, data: toPrescriptionResponse(prescription) };
  }

  /**
   * POST /api/prescriptions — emit a new prescription.
   *
   * doctor_id is taken from the authenticated user — the body's doctor_id field
   * is ignored to prevent IDOR.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreatePrescriptionDtoSchema)) dto: CreatePrescriptionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<unknown>> {
    const prescription = await this.createPrescription.execute({
      doctorId: user.sub,
      patientId: dto.patient_id,
      consultationId: dto.consultation_id ?? null,
      medication: dto.medication,
      dosage: dto.dosage ?? null,
      frequency: dto.frequency ?? null,
      duration: dto.duration ?? null,
      notes: dto.notes ?? null,
      presentation: dto.presentation ?? null,
    });
    return { success: true, data: toPrescriptionResponse(prescription) };
  }
}
