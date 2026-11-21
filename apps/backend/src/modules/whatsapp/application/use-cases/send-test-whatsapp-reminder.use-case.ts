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
import { AppointmentActionTokenService } from '../../infrastructure/services/appointment-action-token.service';
import { buildDoctorDisplayName } from '../../../document-sharing/application/utils/build-doctor-display-name';
import { AppointmentNotFoundError } from '../../../appointments/domain/errors/appointment-not-found.error';
import type { TemplateButtonParam } from '../../domain/ports/iwhatsapp-sender.port';

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
    private readonly tokenService: AppointmentActionTokenService,
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

    const buttonParams: TemplateButtonParam[] | undefined =
      input.type === '24h' && appointment.paymentStatus !== 'approved'
        ? this.build24hButtonParams(appointment.id, appointment.scheduledAt)
        : undefined;

    const result = await this.whatsApp.sendTemplate({
      participantId: appointment.patientPhone,
      templateName,
      templateLanguage: 'es',
      templateParams,
      templateButtonParams: buttonParams,
    });

    return {
      sent: result !== null,
      templateName,
      messageId: result?.messageId ?? null,
      conversationId: result?.conversationId ?? null,
    };
  }

  private build24hButtonParams(appointmentId: string, scheduledAt: Date): TemplateButtonParam[] {
    const expMs = scheduledAt.getTime();

    const confirmPayload = this.tokenService.generateButtonPayload({
      appointmentId,
      expMs,
      action: 'confirm',
      satMs: 0,
    });

    const reschedulePayload = this.tokenService.generateButtonPayload({
      appointmentId,
      expMs,
      action: 'reschedule',
      satMs: expMs,
    });

    const cancelPayload = this.tokenService.generateButtonPayload({
      appointmentId,
      expMs,
      action: 'cancel',
      satMs: 0,
    });

    return [
      {
        index: 0,
        subType: 'quick_reply',
        parameters: [{ type: 'payload', payload: confirmPayload }],
      },
      {
        index: 1,
        subType: 'quick_reply',
        parameters: [{ type: 'payload', payload: reschedulePayload }],
      },
      {
        index: 2,
        subType: 'quick_reply',
        parameters: [{ type: 'payload', payload: cancelPayload }],
      },
    ];
  }
}
