import { Inject, Injectable } from '@nestjs/common';
import {
  IOfficeRepository,
  OFFICE_REPOSITORY,
} from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { DaySchedule } from '../../../domain/value-objects/day-schedule.vo';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
import type { UpdateOfficeDto } from '@delta/shared-types';

@Injectable()
export class UpdateOfficeUseCase {
  constructor(
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(officeId: string, dto: UpdateOfficeDto, doctorId: string): Promise<Office> {
    // 1. Ownership check — returns null if ID does not belong to this doctor
    const existing = await this.officeRepo.findByIdForDoctor(officeId, doctorId);
    if (!existing) {
      throw new OfficeNotFoundError();
    }

    // 2. Validate schedule if provided
    const newSchedule = dto.schedule ?? existing.schedule;
    for (const entry of newSchedule) {
      const ds = DaySchedule.validate(entry);
      if (!ds) {
        throw new OfficeInvalidScheduleError(`Invalid schedule entry for day ${entry.day}`);
      }
      if (!ds.hasValidWindow()) {
        throw new OfficeInvalidScheduleError(`Schedule for day ${entry.day} has start >= end`);
      }
    }

    // 3. Merge updates into the existing office (immutable)
    const updated = Office.create({
      id: existing.id,
      doctorId: existing.doctorId,
      name: dto.name ?? existing.name,
      address: dto.address ?? existing.address,
      city: dto.city ?? existing.city,
      phone: dto.phone ?? existing.phone,
      schedule: newSchedule,
      slotDuration: dto.slot_duration ?? existing.slotDuration,
      bufferMinutes: dto.buffer_minutes ?? existing.bufferMinutes,
      isActive: existing.isActive,
      modality: dto.modality ?? existing.modality,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    return this.officeRepo.save(updated);
  }
}
