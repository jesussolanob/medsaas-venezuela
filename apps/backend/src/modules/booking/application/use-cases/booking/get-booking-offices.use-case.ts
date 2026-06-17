import { Inject, Injectable } from '@nestjs/common';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';
import type { DayScheduleParams } from '../../../../offices/domain/value-objects/day-schedule.vo';
import type { OfficeModality } from '../../../../offices/domain/entities/office.entity';

/** Public office data surfaced to the booking widget. No PII, no internal fields. */
export interface BookingOfficeDto {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  schedule: DayScheduleParams[];
  slotDuration: number;
  bufferMinutes: number;
  modality: OfficeModality;
  allowsOnline: boolean;
}

/**
 * GetBookingOfficesUseCase — public use case (no auth).
 *
 * Returns the list of ACTIVE offices for a doctor, mapped to a safe public DTO.
 * Used by the booking widget to let patients select a consultorio before booking.
 *
 * Intentionally reuses the existing OFFICE_REPOSITORY interface already exported
 * by OfficesModule — no new repository contracts needed.
 */
@Injectable()
export class GetBookingOfficesUseCase {
  constructor(
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(doctorId: string): Promise<BookingOfficeDto[]> {
    const offices = await this.officeRepo.findActiveByDoctor(doctorId);
    return offices.map((o) => ({
      id: o.id,
      name: o.name,
      address: o.address,
      city: o.city,
      phone: o.phone,
      schedule: o.schedule,
      slotDuration: o.slotDuration,
      bufferMinutes: o.bufferMinutes,
      modality: o.modality,
      allowsOnline: o.modality === 'online' || o.modality === 'both',
    }));
  }
}
