import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import {
  IMessageRepository,
  MESSAGE_REPOSITORY,
} from '../../../domain/repositories/message.repository';
import { Message } from '../../../domain/entities/message.entity';
import { MessageNotFoundError } from '../../../domain/errors/message-not-found.error';
import type { SendMessageDto } from '@delta/shared-types';

/**
 * Sends a doctor_to_patient message.
 * Verifies patient ownership before persisting (anti-IDOR).
 * Body encryption happens in the repository layer, not here.
 */
@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(MESSAGE_REPOSITORY)
    private readonly messageRepo: IMessageRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(dto: SendMessageDto, doctorId: string): Promise<Message> {
    // Verify the patient belongs to this doctor — prevents IDOR on message creation.
    const patient = await this.patientRepo.findById(dto.patient_id, doctorId);
    if (!patient) {
      throw new MessageNotFoundError();
    }

    const now = new Date();
    const message = Message.create({
      id: randomUUID(),
      doctorId,
      patientId: dto.patient_id,
      body: dto.body,
      direction: 'doctor_to_patient',
      readAt: null,
      createdAt: now,
    });

    return this.messageRepo.save(message);
  }
}
