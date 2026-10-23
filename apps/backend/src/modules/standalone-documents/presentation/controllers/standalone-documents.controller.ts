import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreateStandaloneDocumentDtoSchema,
  UpdateStandaloneDocumentDtoSchema,
  VoidStandaloneDocumentDtoSchema,
  ListStandaloneDocumentsQuerySchema,
  type CreateStandaloneDocumentDto,
  type UpdateStandaloneDocumentDto,
  type VoidStandaloneDocumentDto,
  type ListStandaloneDocumentsQuery,
} from '@delta/shared-types';

import { ListStandaloneDocumentsUseCase } from '../../application/use-cases/list-standalone-documents.use-case';
import { GetStandaloneDocumentUseCase } from '../../application/use-cases/get-standalone-document.use-case';
import { CreateStandaloneDocumentUseCase } from '../../application/use-cases/create-standalone-document.use-case';
import { UpdateStandaloneDocumentUseCase } from '../../application/use-cases/update-standalone-document.use-case';
import { DeleteStandaloneDocumentUseCase } from '../../application/use-cases/delete-standalone-document.use-case';
import { IssueStandaloneDocumentUseCase } from '../../application/use-cases/issue-standalone-document.use-case';
import { VoidStandaloneDocumentUseCase } from '../../application/use-cases/void-standalone-document.use-case';
import type { StandaloneDocument } from '../../domain/entities/standalone-document.entity';
import type {
  StandaloneDocumentSummary,
  StandaloneDocumentDetail,
} from '../../domain/repositories/istandalone-document.repository';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/** Respuesta del detalle según el contrato F: plana, sin los métodos de la entidad. */
interface StandaloneDocumentDetailResponse {
  id: string;
  type: StandaloneDocument['type'];
  code: string | null;
  status: StandaloneDocument['status'];
  patientId: string;
  patientName: string;
  content: Record<string, unknown>;
  voidReason: string | null;
  createdAt: Date;
  issuedAt: Date | null;
  voidedAt: Date | null;
  patient: StandaloneDocumentDetail['patient'];
}

/**
 * StandaloneDocumentsController — CRUD + issue + void for standalone documents.
 *
 * All routes under /doctor/standalone-documents (global prefix `api` already
 * set on the NestJS app; full path = /api/doctor/standalone-documents).
 *
 * SECURITY:
 *   - AppAuthGuard required on all endpoints.
 *   - doctorId is ALWAYS taken from user.sub (never from the request body).
 *   - Anti-IDOR: foreign and missing documents return the same 404.
 *   - patientName in list view is decrypted by the repository — NEVER log.
 *   - GET /:id returns patient { id, fullName, cedula, age } for PDF rendering.
 *     This is the same PII exposure policy as consultation detail (doctor owns
 *     the patient record).
 */
@Controller('doctor/standalone-documents')
@UseGuards(AppAuthGuard)
export class StandaloneDocumentsController {
  constructor(
    private readonly listUseCase: ListStandaloneDocumentsUseCase,
    private readonly getUseCase: GetStandaloneDocumentUseCase,
    private readonly createUseCase: CreateStandaloneDocumentUseCase,
    private readonly updateUseCase: UpdateStandaloneDocumentUseCase,
    private readonly deleteUseCase: DeleteStandaloneDocumentUseCase,
    private readonly issueUseCase: IssueStandaloneDocumentUseCase,
    private readonly voidUseCase: VoidStandaloneDocumentUseCase,
  ) {}

  /**
   * GET /api/doctor/standalone-documents?patient_id=&type=&status=
   * Lists documents for the doctor ordered by created_at DESC.
   * Returns summary with decrypted patientName — NEVER log.
   */
  @Get()
  async index(
    @Query(new ZodValidationPipe(ListStandaloneDocumentsQuerySchema))
    query: ListStandaloneDocumentsQuery,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StandaloneDocumentSummary[]>> {
    const data = await this.listUseCase.execute(user.sub, query);
    return { success: true, data };
  }

  /**
   * POST /api/doctor/standalone-documents
   * Creates a new draft. Returns 201.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateStandaloneDocumentDtoSchema))
    dto: CreateStandaloneDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StandaloneDocument>> {
    const doc = await this.createUseCase.execute(dto, user.sub);
    return { success: true, data: doc };
  }

  /**
   * GET /api/doctor/standalone-documents/:id
   * Returns document + patient { id, fullName, cedula, age } for PDF rendering.
   * 404 for missing or foreign.
   */
  @Get(':id')
  async show(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StandaloneDocumentDetailResponse>> {
    const detail = await this.getUseCase.execute(id, user.sub);
    // Contrato F: el detalle va PLANO (campos del documento + `patientName` +
    // `patient`). Devolver `{ document, patient }` anidado dejaba al frontend sin
    // `type` ni `content`: el modal de "Editar borrador" abría vacío y el PDF no
    // se podía generar (visto en QA de staging, 23/10).
    return {
      success: true,
      data: {
        id: detail.document.id,
        type: detail.document.type,
        code: detail.document.code,
        status: detail.document.status,
        patientId: detail.document.patientId,
        patientName: detail.patient.fullName,
        content: detail.document.content,
        voidReason: detail.document.voidReason,
        createdAt: detail.document.createdAt,
        issuedAt: detail.document.issuedAt,
        voidedAt: detail.document.voidedAt,
        patient: detail.patient,
      },
    };
  }

  /**
   * PATCH /api/doctor/standalone-documents/:id
   * Updates content. Only draft documents (409 otherwise).
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStandaloneDocumentDtoSchema))
    dto: UpdateStandaloneDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StandaloneDocument>> {
    const doc = await this.updateUseCase.execute(id, user.sub, dto);
    return { success: true, data: doc };
  }

  /**
   * DELETE /api/doctor/standalone-documents/:id
   * Deletes a draft. Returns 204. 409 if not draft.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.deleteUseCase.execute(id, user.sub);
  }

  /**
   * POST /api/doctor/standalone-documents/:id/issue
   * Transitions draft → issued. Assigns REC/PAR/REP-YYYYMM-NNNN code.
   * 409 if not draft.
   */
  @Post(':id/issue')
  async issue(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StandaloneDocument>> {
    const doc = await this.issueUseCase.execute(id, user.sub);
    return { success: true, data: doc };
  }

  /**
   * POST /api/doctor/standalone-documents/:id/void
   * Transitions issued → voided. Accepts optional reason.
   * 409 if not issued.
   */
  @Post(':id/void')
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(VoidStandaloneDocumentDtoSchema)) dto: VoidStandaloneDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<StandaloneDocument>> {
    const doc = await this.voidUseCase.execute(id, user.sub, dto);
    return { success: true, data: doc };
  }
}
