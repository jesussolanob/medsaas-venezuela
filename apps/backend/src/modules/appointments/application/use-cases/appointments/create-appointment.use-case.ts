import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CreateAppointmentDto } from '@delta/shared-types';
import { Appointment } from '../../../domain/entities/appointment.entity';
import { AppointmentConflictError } from '../../../domain/errors/appointment-conflict.error';
import { AppointmentDuplicateError } from '../../../domain/errors/appointment-duplicate.error';
import { InsufficientSessionsError } from '../../../domain/errors/insufficient-sessions.error';
import { AppointmentOfficeInvalidError } from '../../../domain/errors/appointment-office-invalid.error';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../domain/repositories/appointment.repository';
import {
  OFFICE_REPOSITORY,
  type IOfficeRepository,
} from '../../../../offices/domain/repositories/office.repository';

@Injectable()
export class CreateAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(OFFICE_REPOSITORY)
    private readonly officeRepo: IOfficeRepository,
  ) {}

  async execute(dto: CreateAppointmentDto): Promise<Appointment> {
    const scheduledAt = new Date(dto.scheduled_at);

    // 1. If an office is specified, validate ownership and modality compatibility.
    //    Also capture slotDuration so we can (a) check overlap correctly and (b) persist it.
    let slotDuration = 30;
    if (dto.office_id) {
      const office = await this.officeRepo.findById(dto.office_id);
      if (!office || !office.isOwnedBy(dto.doctor_id)) {
        throw new AppointmentOfficeInvalidError('not_owned');
      }
      if (!office.supportsModality(dto.appointment_mode)) {
        throw new AppointmentOfficeInvalidError('modality_mismatch');
      }
      slotDuration = office.slotDuration;
    }

    // 2. Guard: same patient already has an overlapping appointment (cross-doctor).
    //    Replaces the old ±15 min hasDuplicate check with interval-based overlap detection.
    if (dto.patient_id) {
      const patientOverlaps = await this.appointmentRepo.hasPatientOverlap({
        patientId: dto.patient_id,
        scheduledAt,
        durationMinutes: slotDuration,
      });
      if (patientOverlaps) {
        throw new AppointmentDuplicateError(dto.patient_id, scheduledAt);
      }
    }

    // 3. Guard: slot overlaps with any other active appointment for this doctor.
    //    Uses the half-open interval [scheduledAt, scheduledAt + slotDuration).
    const hasConflict = await this.appointmentRepo.hasOverlap({
      doctorId: dto.doctor_id,
      scheduledAt,
      durationMinutes: slotDuration,
    });
    if (hasConflict) {
      throw new AppointmentConflictError(scheduledAt);
    }

    // 4. If a package is involved, validate ownership, status and sessions
    if (dto.package_id) {
      const pkg = await this.appointmentRepo.findPackageById(dto.package_id);

      if (
        !pkg ||
        pkg.doctorId !== dto.doctor_id ||
        pkg.status !== 'active' ||
        pkg.usedSessions >= pkg.totalSessions
      ) {
        throw new InsufficientSessionsError(dto.package_id);
      }

      // 5. Optimistic lock: increment used_sessions only if unchanged since we read it
      const lockAcquired = await this.appointmentRepo.incrementPackageSessions(
        pkg.id,
        pkg.usedSessions,
      );
      if (!lockAcquired) {
        // Another concurrent request consumed the last session between our read and update.
        // This is a package exhaustion condition, not a slot conflict — use the correct error
        // so the client can surface the right feedback to the user.
        throw new InsufficientSessionsError(pkg.id);
      }
    }

    // 6. Build and persist the appointment domain entity
    const now = new Date();
    const appointment = Appointment.create({
      id: randomUUID(),
      doctorId: dto.doctor_id,
      patientId: dto.patient_id ?? null,
      authUserId: dto.auth_user_id ?? null,
      consultationId: null,
      patientName: dto.patient_name,
      patientPhone: dto.patient_phone ?? null,
      patientEmail: dto.patient_email ?? null,
      patientCedula: dto.patient_cedula ?? null,
      scheduledAt,
      status: 'scheduled',
      appointmentMode: dto.appointment_mode,
      source: null,
      planName: dto.plan_name,
      planPrice: dto.plan_price,
      paymentMethod: dto.payment_method ?? null,
      paymentReference: dto.payment_reference ?? null,
      paymentReceiptUrl: null,
      insuranceName: null,
      bcvRate: dto.bcv_rate ?? null,
      amountBs: null,
      packageId: dto.package_id ?? null,
      sessionNumber: null,
      chiefComplaint: dto.chief_complaint ?? null,
      appointmentCode: null,
      officeId: dto.office_id ?? null,
      durationMinutes: slotDuration,
      createdAt: now,
      updatedAt: now,
    });

    return this.appointmentRepo.save(appointment);
  }
}
