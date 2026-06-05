import { Inject, Injectable } from '@nestjs/common';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from '../../../domain/repositories/message.repository';
import type { Message } from '../../../domain/entities/message.entity';
import { MessageNotFoundError } from '../../../domain/errors/message-not-found.error';

/**
 * Returns all messages in a thread between the authenticated doctor and the given patient.
 * Verifies patient ownership before returning messages (anti-IDOR).
 * Marks all patient_to_doctor messages as read after fetching.
 */
@Injectable()
export class GetThreadUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(doctorId: string, patientId: string): Promise<Message[]> {
    // Verify the patient belongs to this doctor — prevents IDOR on thread access.
    const patient = await this.patientRepo.findById(patientId, doctorId);
    if (!patient) {
      throw new MessageNotFoundError();
    }

    const messages = await this.messageRepo.findThread(doctorId, patientId);

    // Mark incoming (patient_to_doctor) messages as read.
    await this.messageRepo.markThreadRead(doctorId, patientId);

    return messages;
  }
}
