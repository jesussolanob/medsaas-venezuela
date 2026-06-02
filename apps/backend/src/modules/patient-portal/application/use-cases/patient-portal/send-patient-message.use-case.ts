import { Inject, Injectable } from '@nestjs/common';
import { PatientMessageNotAllowedError } from '../../../domain/errors/patient-message-not-allowed.error';
import {
  PATIENT_PORTAL_REPOSITORY,
  type IPatientPortalRepository,
  type PatientMessageRow,
} from '../../../domain/repositories/patient-portal.repository';

export interface SendPatientMessageInput {
  authUserId: string;
  doctorId: string;
  body: string;
}

/**
 * Sends a patient_to_doctor message.
 *
 * SECURITY:
 *   1. authUserId comes from DevAuthGuard (user.sub) — never from client input.
 *   2. Before inserting, we verify that a patients row exists linking authUserId → doctorId.
 *      Without this check, any patient could send messages to any doctor.
 *   3. The patientId used for the insert comes from the DB lookup, not from the client.
 */
@Injectable()
export class SendPatientMessageUseCase {
  constructor(
    @Inject(PATIENT_PORTAL_REPOSITORY)
    private readonly portalRepo: IPatientPortalRepository,
  ) {}

  async execute(input: SendPatientMessageInput): Promise<PatientMessageRow> {
    // Step 1: verify patient–doctor relationship exists
    const patientId = await this.portalRepo.findPatientIdForDoctorRelationship(
      input.authUserId,
      input.doctorId,
    );

    if (!patientId) {
      throw new PatientMessageNotAllowedError();
    }

    // Step 2: insert message using the DB-resolved patientId
    return this.portalRepo.insertMessage(patientId, input.doctorId, input.body);
  }
}
