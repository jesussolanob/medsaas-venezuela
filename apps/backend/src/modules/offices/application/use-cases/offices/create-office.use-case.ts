import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IOfficeRepository,
  OFFICE_REPOSITORY,
} from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { DaySchedule } from '../../../domain/value-objects/day-schedule.vo';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
import type { CreateOfficeDto } from '@delta/shared-types';

@Injectable()
export class CreateOfficeUseCase {
  constructor(
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(dto: CreateOfficeDto, doctorId: string): Promise<Office> {
    // Validate schedule entries
    for (const entry of dto.schedule) {
      const ds = DaySchedule.validate(entry);
      if (!ds) {
        throw new OfficeInvalidScheduleError(`Invalid schedule entry for day ${entry.day}`);
      }
      if (!ds.hasValidWindow()) {
        throw new OfficeInvalidScheduleError(`Schedule for day ${entry.day} has start >= end`);
      }
    }

    const now = new Date();
    const office = Office.create({
      id: randomUUID(),
      doctorId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      phone: dto.phone,
      schedule: dto.schedule,
      slotDuration: dto.slot_duration,
      bufferMinutes: dto.buffer_minutes,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return this.officeRepo.create(office);
  }
}
