import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IOfficeRepository,
  OFFICE_REPOSITORY,
} from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { DaySchedule, type DayScheduleParams } from '../../../domain/value-objects/day-schedule.vo';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
import { OfficeScheduleConflictError } from '../../../domain/errors/office-schedule-conflict.error';
import type { CreateOfficeDto } from '@delta/shared-types';

/**
 * Returns true when two time windows [startA, endA) and [startB, endB) overlap.
 * Times are "HH:MM" strings (24-hour). Uses half-open interval overlap condition:
 *   startA < endB AND startB < endA
 */
export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const toMinutes = (t: string): number => {
    const parts = t.split(':');
    return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
  };
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

/**
 * Checks whether the proposed schedule for a new office conflicts with any
 * enabled day-schedule in the existing active offices list.
 *
 * Throws OfficeScheduleConflictError on the first overlapping day found.
 * Set excludeId to skip one specific office (used by UpdateOfficeUseCase).
 */
export function assertNoScheduleConflict(
  proposedSchedule: DayScheduleParams[],
  activeOffices: Office[],
  excludeId?: string,
): void {
  for (const slot of proposedSchedule) {
    if (!slot.enabled) continue;

    for (const existing of activeOffices) {
      if (excludeId && existing.id === excludeId) continue;
      if (!existing.isActive) continue;

      const existingSlot = existing.schedule.find((s) => s.day === slot.day && s.enabled);
      if (!existingSlot) continue;

      if (timesOverlap(slot.start, slot.end, existingSlot.start, existingSlot.end)) {
        throw new OfficeScheduleConflictError(slot.day);
      }
    }
  }
}

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

    // Check for schedule overlap with existing active offices
    const activeOffices = await this.officeRepo.findActiveByDoctor(doctorId);
    assertNoScheduleConflict(dto.schedule, activeOffices);

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
      modality: dto.modality ?? 'in_person',
      createdAt: now,
      updatedAt: now,
    });

    return this.officeRepo.create(office);
  }
}
