import { Inject, Injectable } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
} from '../../../appointments/domain/repositories/appointment.repository';
import { WHATSAPP_SENDER, type IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { buildDoctorDisplayName } from '../../../document-sharing/application/utils/build-doctor-display-name';
import { AppointmentNotFoundError } from '../../../appointments/domain/errors/appointment-not-found.error';

export interface SendTestWhatsAppReminderInput {
  appointmentId: string;
  type: '24h' | '3h';
}

export interface SendTestWhatsAppReminderResult {
  sent: boolean;
  templateName: string;
  messageId: string | null;
  conversationId: string | null;
}

/**
 * SendTestWhatsAppReminderUseCase
 *
 * Staging-only test trigger — called by POST /api/admin/whatsapp/test-reminder.
 * Sends a WhatsApp reminder for the given appointment without inserting a queue row.
 * Useful for verifying template rendering and allowlist configuration.
 *
 * NOTE: templateButtonParams are NOT sent — Zernio rejects quick_reply subType
 * (only "url"|"copy_code"|"flow" are accepted). Button taps are identified
 * server-side by matching metadata.quotedMessageId → reminders_queue.external_message_id.
 *
 * Requires NODE_ENV !== 'production' — the controller enforces this guard.
 */
@Injectable()
export class SendTestWhatsAppReminderUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(WHATSAPP_SENDER)
    private readonly whatsApp: IWhatsAppSender,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
  ) {}

  async execute(input: SendTestWhatsAppReminderInput): Promise<SendTestWhatsAppReminderResult> {
    const appointment = await this.appointmentRepo.findById(input.appointmentId);
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    if (!appointment.patientPhone) {
      return { sent: false, templateName: '', messageId: null, conversationId: null };
    }

    const profile = await this.doctorProfileRepo.findByDoctorId(appointment.doctorId);
    const doctorName = buildDoctorDisplayName(profile);
    const firstName = (appointment.patientName ?? '').split(' ')[0] || 'Paciente';

    const time = appointment.scheduledAt.toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
    });

    const templateParams = [firstName, doctorName, time, 'Consultorio'];

    const templateName =
      input.type === '24h'
        ? appointment.paymentStatus === 'approved'
          ? 'recordatorio_cita_24h_pagada'
          : 'recordatorio_cita_24h'
        : 'recordatorio_cita_hoy';

    const result = await this.whatsApp.sendTemplate({
      participantId: appointment.patientPhone,
      templateName,
      templateLanguage: 'es',
      templateParams,
      // templateButtonParams intentionally omitted — Zernio rejects quick_reply subType
    });

    return {
      sent: result !== null,
      templateName,
      messageId: result?.messageId ?? null,
      conversationId: result?.conversationId ?? null,
    };
  }
}
