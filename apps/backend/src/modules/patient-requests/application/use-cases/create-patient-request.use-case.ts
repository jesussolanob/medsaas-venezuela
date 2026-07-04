import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import {
  PATIENT_REQUEST_ACCESS_CODE_REPOSITORY,
  type IPatientRequestAccessCodeRepository,
} from '../../domain/repositories/patient-request-access-code.repository';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestAccessCode } from '../../domain/entities/patient-request-access-code.entity';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';
import { PatientHasNoEmailError } from '../../domain/errors/patient-has-no-email.error';
import { PatientCedulaRequiredError } from '../../domain/errors/patient-cedula-required.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { MailerService } from '../../../email/application/services/mailer.service';
import type { CreatePatientRequestDto } from '../dtos/patient-request.dto';

export interface CreatePatientRequestInput {
  doctorId: string;
  dto: CreatePatientRequestDto;
}

export interface CreatePatientRequestOutput {
  id: string;
  token: string;
  url: string;
  code: string;
  expiresAt: Date;
}

/**
 * CreatePatientRequestUseCase — creates a request to the patient for documents/response.
 *
 * FLOW:
 *   1. Verify the patient exists and belongs to the doctor (anti-IDOR).
 *   2. Verify the patient has an email (needed for code delivery).
 *   3. Verify the patient has a cédula (needed as 2FA for verify-code).
 *   4. Generate a 48-byte URL-safe token and a 6-digit access code (48h TTL).
 *   5. Persist the request and the code.
 *   6. Fire-and-forget email to the patient with the code.
 *   7. Return { id, token, url, code, expiresAt }.
 *
 * SECURITY:
 *   - doctorId always comes from user.sub (never from body).
 *   - Patient ownership verified before any write (anti-IDOR).
 *   - Token is crypto.randomBytes(48).toString('base64url') — 384 bits of entropy.
 *   - Code is 6 random decimal digits.
 *   - Never log PII (patient name, email, cedula, code, or token).
 */
@Injectable()
export class CreatePatientRequestUseCase {
  private readonly logger = new Logger(CreatePatientRequestUseCase.name);

  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    @Inject(PATIENT_REQUEST_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IPatientRequestAccessCodeRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: CreatePatientRequestInput): Promise<CreatePatientRequestOutput> {
    // 1. Verify patient ownership (anti-IDOR)
    const patient = await this.patientRepo.findById(input.dto.patientId, input.doctorId);
    if (!patient) {
      throw new PatientRequestNotFoundError();
    }

    // 2. Patient must have email — code is delivered by email only
    if (!patient.email || !patient.email.trim()) {
      throw new PatientHasNoEmailError();
    }

    // 3. Patient must have cédula — it is the second factor for verify-code
    if (!patient.cedula || !patient.cedula.trim()) {
      throw new PatientCedulaRequiredError();
    }

    // 4. Generate secure token and 6-digit code
    const token = crypto.randomBytes(48).toString('base64url');
    const rawCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 5a. Persist request
    const request = PatientRequest.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      patientId: input.dto.patientId,
      token,
      title: input.dto.title,
      description: input.dto.description ?? null,
      responseText: null,
      status: 'pending',
      failedAttempts: 0,
      lastCodeRequestedAt: null,
      fulfilledAt: null,
      createdAt: new Date(),
    });
    const savedRequest = await this.requestRepo.save(request);

    // 5b. Persist code
    const accessCode = PatientRequestAccessCode.create({
      id: randomUUID(),
      requestId: savedRequest.id,
      code: rawCode,
      expiresAt,
      usedAt: null,
      failedAttempts: 0,
      createdAt: new Date(),
    });
    await this.codeRepo.save(accessCode);

    // 6. Resolve public URL for the patient portal
    const baseUrl =
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    const url = `${baseUrl}/patient-requests/${token}`;

    // 7. Fire-and-forget email to patient
    void this.sendEmailToPatient({
      patientId: savedRequest.patientId,
      patientName: patient.fullName,
      patientEmail: patient.email,
      url,
      code: rawCode,
      title: savedRequest.title,
      expiresAt,
    });

    return { id: savedRequest.id, token, url, code: rawCode, expiresAt };
  }

  private async sendEmailToPatient(params: {
    patientId: string;
    patientName: string;
    patientEmail: string;
    url: string;
    code: string;
    title: string;
    expiresAt: Date;
  }): Promise<void> {
    try {
      const expiresAtStr = params.expiresAt.toLocaleString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await this.mailer.sendTemplate(
        'patient_request_code',
        params.patientEmail,
        {
          patientName: params.patientName,
          title: params.title,
          code: params.code,
          url: params.url,
          expiresAt: expiresAtStr,
        },
        { type: 'patient', id: params.patientId },
      );
    } catch (err) {
      // Fire-and-forget: email failures are logged but never propagated.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[create-patient-request] email notification failed: ${message}`);
    }
  }
}
