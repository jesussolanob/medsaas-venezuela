import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { DoctorScheduleParams } from '../../../domain/value-objects/doctor-schedule.vo';
import type { IDoctorScheduleRepository } from '../../../domain/repositories/doctor-schedule.repository';
import { DoctorScheduleModel } from '../models/doctor-schedule.model';

@Injectable()
export class SequelizeDoctorScheduleRepository implements IDoctorScheduleRepository {
  constructor(
    @InjectModel(DoctorScheduleModel)
    private readonly model: typeof DoctorScheduleModel,
  ) {}

  async findByDoctorId(doctorId: string): Promise<DoctorScheduleParams | null> {
    const row = await this.model.findByPk(doctorId);
    if (!row) return null;
    return this.toDomain(row);
  }

  async upsert(doctorId: string, params: DoctorScheduleParams): Promise<DoctorScheduleParams> {
    const [row] = await this.model.upsert({
      doctorId,
      workDays: params.workDays,
      startTime: params.startTime,
      endTime: params.endTime,
      slotDurationMinutes: params.slotDurationMinutes,
      breakStart: params.breakStart,
      breakEnd: params.breakEnd,
      bookingHorizonWeeks: params.bookingHorizonWeeks ?? 8,
      bookingRequireReason: params.bookingRequireReason ?? false,
      bookingMinLeadDays: params.bookingMinLeadDays ?? 0,
    });
    return this.toDomain(row);
  }

  private toDomain(row: DoctorScheduleModel): DoctorScheduleParams {
    return {
      workDays: row.workDays,
      startTime: row.startTime,
      endTime: row.endTime,
      slotDurationMinutes: row.slotDurationMinutes,
      breakStart: row.breakStart,
      breakEnd: row.breakEnd,
      bookingHorizonWeeks: row.bookingHorizonWeeks ?? 8,
      bookingRequireReason: row.bookingRequireReason ?? false,
      bookingMinLeadDays: row.bookingMinLeadDays ?? 0,
    };
  }
}
