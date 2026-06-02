import { Inject, Injectable } from '@nestjs/common';
import type { UpdateAppointmentStatusDto } from '@delta/shared-types';
import type { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { AppointmentInvalidTransitionError } from '../../../domain/errors/appointment-invalid-transition.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';

@Injectable()
export class UpdateAppointmentStatusUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
  ) {}

  async execute(dto: UpdateAppointmentStatusDto): Promise<Appointment> {
    // 1. Fetch existing appointment
    const appointment = await this.appointmentRepo.findById(dto.id);
    if (!appointment) {
      throw new AppointmentNotFoundError(dto.id);
    }

    // 2. Verify ownership (anti-IDOR)
    if (!appointment.canBeModifiedBy(dto.actor_id)) {
      throw new UnauthorizedError();
    }

    // 3. Guard transition rules
    if (!appointment.canTransitionTo(dto.status)) {
      throw new AppointmentInvalidTransitionError(appointment.status, dto.status);
    }

    // 4. Persist new status
    const updated = await this.appointmentRepo.updateStatus(dto.id, dto.status);

    // 5. Record change in audit log
    await this.appointmentRepo.logStatusChange({
      appointmentId: dto.id,
      actorId: dto.actor_id,
      oldStatus: appointment.status,
      newStatus: dto.status,
    });

    return updated;
  }
}
