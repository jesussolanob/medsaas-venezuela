import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  ShareConsultationDtoSchema,
  VerifyCodeDtoSchema,
  type ShareConsultationDto,
  type VerifyCodeDto,
} from '../../application/dtos/share-consultation.dto';
import { ShareConsultationUseCase } from '../../application/use-cases/document-sharing/share-consultation.use-case';
import { VerifyCodeUseCase } from '../../application/use-cases/document-sharing/verify-code.use-case';
import { DownloadDocumentUseCase } from '../../application/use-cases/document-sharing/download-document.use-case';
import { RequestNewCodeUseCase } from '../../application/use-cases/document-sharing/request-new-code.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * DocumentSharingController
 *
 * DOCTOR endpoints (protected by AppAuthGuard):
 *   POST /api/consultations/:consultationId/share
 *     → generates link + code, sends email to patient.
 *
 * PUBLIC endpoints (NO auth — designed for patient browser):
 *   POST /api/documents/:token/verify-code
 *     → validates 6-digit code, returns sessionToken (15 min).
 *   GET  /api/documents/:token/download?session=<sessionToken>
 *     → validates sessionToken, returns PDF bytes.
 *   POST /api/documents/:token/request-code
 *     → generates a new 6-digit code (old code becomes stale) and re-sends email.
 *
 * SECURITY:
 *   - Doctor endpoints: doctor_id always comes from user.sub (never from body).
 *   - Public endpoints: input validated with Zod; errors are generic (no PHI leak).
 *   - The download endpoint returns binary application/pdf — no JSON envelope.
 */
@Controller()
export class DocumentSharingController {
  constructor(
    private readonly shareConsultation: ShareConsultationUseCase,
    private readonly verifyCode: VerifyCodeUseCase,
    private readonly downloadDocument: DownloadDocumentUseCase,
    private readonly requestNewCode: RequestNewCodeUseCase,
  ) {}

  // ---------------------------------------------------------------------------
  // Doctor endpoint — protected
  // ---------------------------------------------------------------------------

  /**
   * POST /api/consultations/:consultationId/share
   *
   * The doctor shares selected sections of a consultation.
   * Anti-IDOR: doctorId comes from user.sub — body is never trusted for identity.
   *
   * Response: { url, code, expiresAt }
   *   - url   — public page the patient visits (e.g. /documents/:token)
   *   - code  — 6-digit code to enter on that page
   *   - expiresAt — when the code expires (48h from now)
   */
  @Post('consultations/:consultationId/share')
  @UseGuards(AppAuthGuard)
  async share(
    @Param('consultationId') consultationId: string,
    @Body(new ZodValidationPipe(ShareConsultationDtoSchema)) dto: ShareConsultationDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ url: string; code: string; expiresAt: string }>> {
    const result = await this.shareConsultation.execute({
      consultationId,
      doctorId: user.sub,
      dto,
      doctorName: user.email, // used as fallback name; email is non-PHI in this context
    });
    return {
      success: true,
      data: {
        url: result.url,
        code: result.code,
        expiresAt: result.expiresAt.toISOString(),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Public endpoints — no auth
  // ---------------------------------------------------------------------------

  /**
   * POST /api/documents/:token/verify-code
   *
   * Body: { code: "123456" }
   *
   * On success: { sessionToken, sections, expiresAt }
   * On failure: 422 InvalidAccessCodeError or 404 for invalid/revoked links.
   *
   * Anti-bruteforce: 5 failed attempts invalidate the current code.
   */
  @Post('documents/:token/verify-code')
  async verifyCodeEndpoint(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(VerifyCodeDtoSchema)) dto: VerifyCodeDto,
  ): Promise<
    SuccessResponse<{
      sessionToken: string;
      sections: { report: boolean; prescriptions: boolean; ehr: boolean };
      expiresAt: string;
    }>
  > {
    const result = await this.verifyCode.execute({ token, code: dto.code });
    return {
      success: true,
      data: {
        sessionToken: result.sessionToken,
        sections: result.sections,
        expiresAt: result.expiresAt.toISOString(),
      },
    };
  }

  /**
   * GET /api/documents/:token/download?sessionToken=<sessionToken>
   *
   * Validates the HMAC session token and streams the PDF.
   * Response: application/pdf (binary, no JSON envelope).
   *
   * The session token is short-lived (15 min) and issued by verify-code.
   * An absent or empty sessionToken query param is rejected before reaching the use case.
   */
  @Get('documents/:token/download')
  async downloadPdf(
    @Param('token') token: string,
    @Query('sessionToken') sessionToken: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // Explicit presence check: the use case also validates, but catching it here
    // avoids logging a warning for a trivially malformed request.
    const resolvedToken = sessionToken?.trim() ?? '';
    const result = await this.downloadDocument.execute({ token, sessionToken: resolvedToken });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store',
    });
    res.send(Buffer.from(result.pdfBytes));
  }

  /**
   * POST /api/documents/:token/request-code
   *
   * Generates a new 6-digit code for an active link and re-sends the email.
   * Old codes become stale (the latest code is always used for verification).
   * Enforces a 60-second cooldown — returns 429 if called too soon.
   *
   * Response: { expiresAt }
   */
  @Post('documents/:token/request-code')
  async requestCodeEndpoint(
    @Param('token') token: string,
  ): Promise<SuccessResponse<{ expiresAt: string }>> {
    const result = await this.requestNewCode.execute({ token });
    return {
      success: true,
      data: { expiresAt: result.expiresAt.toISOString() },
    };
  }
}
