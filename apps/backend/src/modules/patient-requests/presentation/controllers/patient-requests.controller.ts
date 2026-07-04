import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  CreatePatientRequestDtoSchema,
  VerifyPatientRequestCodeDtoSchema,
  SubmitPatientRequestDtoSchema,
  type CreatePatientRequestDto,
  type VerifyPatientRequestCodeDto,
  type SubmitPatientRequestDto,
} from '../../application/dtos/patient-request.dto';
import { CreatePatientRequestUseCase } from '../../application/use-cases/create-patient-request.use-case';
import { VerifyPatientRequestCodeUseCase } from '../../application/use-cases/verify-patient-request-code.use-case';
import { RequestNewPatientRequestCodeUseCase } from '../../application/use-cases/request-new-patient-request-code.use-case';
import { UploadPatientRequestAttachmentUseCase } from '../../application/use-cases/upload-patient-request-attachment.use-case';
import { SubmitPatientRequestUseCase } from '../../application/use-cases/submit-patient-request.use-case';
import {
  ListPatientRequestsUseCase,
  type ListPatientRequestsOutput,
} from '../../application/use-cases/list-patient-requests.use-case';
import {
  GetPatientRequestUseCase,
  type GetPatientRequestOutput,
} from '../../application/use-cases/get-patient-request.use-case';
import { PatientRequestMissingFileError } from '../../domain/errors/patient-request-missing-file.error';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * PatientRequestsController
 *
 * DOCTOR endpoints (protected by AppAuthGuard):
 *   POST /api/doctor/patient-requests           → create request
 *   GET  /api/doctor/patient-requests           → list doctor's requests
 *   GET  /api/doctor/patient-requests/:id       → detail + signed attachment URLs
 *
 * PUBLIC endpoints (NO auth — designed for patient browser):
 *   POST /api/patient-requests/:token/verify-code   → code+cédula → sessionToken
 *   POST /api/patient-requests/:token/request-code  → new code (60s cooldown)
 *   POST /api/patient-requests/:token/upload         → upload file
 *   POST /api/patient-requests/:token/submit         → submit response
 *
 * SESSION TOKEN (upload & submit):
 *   Transmitted via the `X-Session-Token` header — NOT in the request body —
 *   to prevent it from appearing in body-level access logs.
 *   Portal contract: set `X-Session-Token: <token>` on both upload and submit requests.
 *
 * SECURITY:
 *   - Doctor endpoints: doctorId always from user.sub (never from body).
 *   - Public endpoints: inputs validated with Zod; generic errors to prevent PHI leak.
 *   - Uploaded files: MIME + magic-byte validated, stored privately (isPrivate=true).
 */
@Controller()
export class PatientRequestsController {
  constructor(
    private readonly createRequest: CreatePatientRequestUseCase,
    private readonly verifyCode: VerifyPatientRequestCodeUseCase,
    private readonly requestNewCode: RequestNewPatientRequestCodeUseCase,
    private readonly uploadAttachment: UploadPatientRequestAttachmentUseCase,
    private readonly submitRequest: SubmitPatientRequestUseCase,
    private readonly listRequests: ListPatientRequestsUseCase,
    private readonly getRequest: GetPatientRequestUseCase,
  ) {}

  // ---------------------------------------------------------------------------
  // Doctor endpoints — protected
  // ---------------------------------------------------------------------------

  /**
   * POST /api/doctor/patient-requests
   *
   * Creates a request for the patient to upload documents or provide a response.
   * Fires-and-forgets an email to the patient with the portal URL and 6-digit code.
   *
   * Anti-IDOR: doctorId comes from user.sub.
   */
  @Post('doctor/patient-requests')
  @UseGuards(AppAuthGuard)
  async create(
    @Body(new ZodValidationPipe(CreatePatientRequestDtoSchema)) dto: CreatePatientRequestDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ id: string; token: string; url: string; expiresAt: string }>> {
    const result = await this.createRequest.execute({ doctorId: user.sub, dto });
    return {
      success: true,
      data: {
        id: result.id,
        token: result.token,
        url: result.url,
        expiresAt: result.expiresAt.toISOString(),
      },
    };
  }

  /**
   * GET /api/doctor/patient-requests
   *
   * Lists all requests created by the doctor, with patient names and attachment counts.
   */
  @Get('doctor/patient-requests')
  @UseGuards(AppAuthGuard)
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<ListPatientRequestsOutput>> {
    const result = await this.listRequests.execute({ doctorId: user.sub });
    return { success: true, data: result };
  }

  /**
   * GET /api/doctor/patient-requests/:id
   *
   * Returns full request detail including attachments with fresh signed URLs.
   */
  @Get('doctor/patient-requests/:id')
  @UseGuards(AppAuthGuard)
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<GetPatientRequestOutput>> {
    const result = await this.getRequest.execute({ id, doctorId: user.sub });
    return { success: true, data: result };
  }

  // ---------------------------------------------------------------------------
  // Public endpoints — no auth (patient portal)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/patient-requests/:token/verify-code
   *
   * Body: { code: "123456", cedula: "V-12345678" }
   *
   * 2FA oracle-safe: same 422 error for any mismatch (wrong code, wrong cédula,
   * expired, used, brute-force blocked, or non-existent token).
   *
   * On success: { sessionToken, expiresAt }
   *
   * // rate-limit: cubierto por el BFF (público)
   */
  @Post('patient-requests/:token/verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCodeEndpoint(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(VerifyPatientRequestCodeDtoSchema))
    dto: VerifyPatientRequestCodeDto,
  ): Promise<
    SuccessResponse<{
      sessionToken: string;
      expiresAt: string;
      title: string;
      description: string | null;
    }>
  > {
    const result = await this.verifyCode.execute({ token, code: dto.code, cedula: dto.cedula });
    return {
      success: true,
      data: {
        sessionToken: result.sessionToken,
        expiresAt: result.expiresAt.toISOString(),
        title: result.title,
        description: result.description,
      },
    };
  }

  /**
   * POST /api/patient-requests/:token/request-code
   *
   * Generates a new 6-digit code and re-sends the email.
   * Enforces 60-second cooldown — returns 429 if called too soon.
   *
   * Response: { expiresAt }
   *
   * // rate-limit: cubierto por el BFF (público)
   */
  @Post('patient-requests/:token/request-code')
  @HttpCode(HttpStatus.OK)
  async requestCodeEndpoint(
    @Param('token') token: string,
  ): Promise<SuccessResponse<{ expiresAt: string }>> {
    const result = await this.requestNewCode.execute({ token });
    return {
      success: true,
      data: { expiresAt: result.expiresAt.toISOString() },
    };
  }

  /**
   * POST /api/patient-requests/:token/upload
   *
   * Multipart upload. Accepts a `file` field.
   * Session token must be sent in the `X-Session-Token` header (not in body).
   *
   * SECURITY:
   *   - sessionToken read from header to avoid body-level logging.
   *   - sessionToken validated via HMAC before any file is persisted.
   *   - MIME type, file size, and magic bytes validated.
   *   - Files stored privately (isPrivate: true).
   *   - Allowed types: image/jpeg, image/png, image/webp, application/pdf. Max 10 MB.
   *
   * // rate-limit: cubierto por el BFF (público)
   */
  @Post('patient-requests/:token/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('token') token: string,
    @Headers('x-session-token') sessionToken: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<SuccessResponse<{ id: string; fileName: string }>> {
    if (!file) {
      throw new PatientRequestMissingFileError();
    }

    const result = await this.uploadAttachment.execute({
      token,
      sessionToken: sessionToken ?? '',
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
    });

    return { success: true, data: result };
  }

  /**
   * POST /api/patient-requests/:token/submit
   *
   * Body: { responseText?: string | null }
   * Session token must be sent in the `X-Session-Token` header (not in body).
   *
   * Marks the request as fulfilled with an optional text response.
   * Idempotency: if already fulfilled, returns 422.
   *
   * // rate-limit: cubierto por el BFF (público)
   */
  @Post('patient-requests/:token/submit')
  @HttpCode(HttpStatus.OK)
  async submitEndpoint(
    @Param('token') token: string,
    @Headers('x-session-token') sessionToken: string | undefined,
    @Body(new ZodValidationPipe(SubmitPatientRequestDtoSchema)) dto: SubmitPatientRequestDto,
  ): Promise<SuccessResponse<{ requestId: string }>> {
    const result = await this.submitRequest.execute({
      token,
      sessionToken: sessionToken ?? '',
      responseText: dto.responseText ?? null,
    });
    return { success: true, data: result };
  }
}
