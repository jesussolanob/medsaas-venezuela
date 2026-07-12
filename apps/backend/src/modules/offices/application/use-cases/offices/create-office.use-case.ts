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
 * Validates that no two enabled blocks within the proposed schedule overlap on
 * the same day (self-overlap). This guards against an office being created or
 * updated with e.g. 08:00-12:00 and 10:00-14:00 on Monday.
 *
 * Throws OfficeInvalidScheduleError when a self-overlap is detected.
 */
export function assertNoSelfOverlap(proposedSchedule: DayScheduleParams[]): void {
  const enabledByDay = new Map<number, DayScheduleParams[]>();
  for (const slot of proposedSchedule) {
    if (!slot.enabled) continue;
    const list = enabledByDay.get(slot.day) ?? [];
    list.push(slot);
    enabledByDay.set(slot.day, list);
  }

  for (const [day, slots] of enabledByDay) {
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!;
        const b = slots[j]!;
        if (timesOverlap(a.start, a.end, b.start, b.end)) {
          throw OfficeInvalidScheduleError.selfOverlap(day, a.start, a.end, b.start, b.end);
        }
      }
    }
  }
}

/**
 * Checks whether the proposed schedule for a new office conflicts with any
 * enabled day-schedule block in the existing active offices list.
 *
 * Supports multiple blocks per day: checks the proposed slot against ALL
 * enabled blocks of that day in each existing office.
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

      const existingSlots = existing.getEnabledSchedulesForDay(slot.day);
      for (const existingSlot of existingSlots) {
        if (timesOverlap(slot.start, slot.end, existingSlot.start, existingSlot.end)) {
          throw new OfficeScheduleConflictError(slot.day);
        }
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
        throw OfficeInvalidScheduleError.invalidEntry(entry.day);
      }
      if (!ds.hasValidWindow()) {
        throw OfficeInvalidScheduleError.invalidWindow(entry.day);
      }
    }

    // Check for self-overlap within the proposed schedule (same day, same office)
    assertNoSelfOverlap(dto.schedule);

    // Check for schedule overlap with existing active offices (cross-office)
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
      mapUrl: dto.map_url ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.officeRepo.create(office);
  }
}
