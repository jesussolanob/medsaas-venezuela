import { Inject, Injectable } from '@nestjs/common';
import {
  DoctorSchedule,
  type DoctorScheduleParams,
} from '../../../domain/value-objects/doctor-schedule.vo';
import {
  DOCTOR_SCHEDULE_REPOSITORY,
  type IDoctorScheduleRepository,
} from '../../../domain/repositories/doctor-schedule.repository';

@Injectable()
export class GetDoctorScheduleUseCase {
  constructor(
    @Inject(DOCTOR_SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: IDoctorScheduleRepository,
  ) {}

  async execute(doctorId: string): Promise<DoctorScheduleParams> {
    const stored = await this.scheduleRepo.findByDoctorId(doctorId);
    if (!stored) {
      // Return the default schedule (Mon–Fri, 08:00–17:00, 30 min)
      return DoctorSchedule.default();
    }
    return stored;
  }
}
