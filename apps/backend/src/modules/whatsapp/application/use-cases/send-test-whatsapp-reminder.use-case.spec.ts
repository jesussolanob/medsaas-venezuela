import { SendTestWhatsAppReminderUseCase } from './send-test-whatsapp-reminder.use-case';
import type { IAppointmentRepository } from '../../../appointments/domain/repositories/appointment.repository';
import type { IWhatsAppSender } from '../../domain/ports/iwhatsapp-sender.port';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { Appointment } from '../../../appointments/domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../appointments/domain/errors/appointment-not-found.error';

function makeAppt(
  overrides: { paymentStatus?: string | null; patientPhone?: string | null } = {},
): Appointment {
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Appointment(
    'appt-001',
    'doc-001',
    'pat-001',
    null,
    null,
    'Juan Pérez',
    overrides.patientPhone !== undefined ? overrides.patientPhone : '+584141234567',
    null,
    null,
    scheduledAt,
    'scheduled',
    'presencial',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    new Date(),
    new Date(),
    overrides.paymentStatus ?? null,
  );
}

function makeSut(
  appt: Appointment | null,
  sendResult: { messageId: string; conversationId: string; participantId: string } | null = {
    messageId: 'msg-test',
    conversationId: 'conv-test',
    participantId: '+584141234567',
  },
): { sut: SendTestWhatsAppReminderUseCase; whatsApp: jest.Mocked<IWhatsAppSender> } {
  const repo: jest.Mocked<IAppointmentRepository> = {
    findById: jest.fn().mockResolvedValue(appt),
  } as unknown as jest.Mocked<IAppointmentRepository>;

  const whatsApp: jest.Mocked<IWhatsAppSender> = {
    sendTemplate: jest.fn().mockResolvedValue(sendResult),
    sendText: jest.fn().mockResolvedValue(true),
  } as jest.Mocked<IWhatsAppSender>;

  const doctorRepo: jest.Mocked<IDoctorProfileRepository> = {
    findByDoctorId: jest.fn().mockResolvedValue({
      fullName: 'García',
      professionalTitle: 'Dr.',
      email: 'garcia@test.com',
    }),
  } as unknown as jest.Mocked<IDoctorProfileRepository>;

  const sut = new SendTestWhatsAppReminderUseCase(repo, whatsApp, doctorRepo);

  return { sut, whatsApp };
}

describe('SendTestWhatsAppReminderUseCase', () => {
  it('throws AppointmentNotFoundError when appointment does not exist', async () => {
    const { sut } = makeSut(null);
    await expect(sut.execute({ appointmentId: 'appt-999', type: '24h' })).rejects.toBeInstanceOf(
      AppointmentNotFoundError,
    );
  });

  it('returns sent=false when appointment has no phone', async () => {
    const appt = makeAppt({ patientPhone: null });
    const { sut } = makeSut(appt);
    const result = await sut.execute({ appointmentId: 'appt-001', type: '24h' });
    expect(result.sent).toBe(false);
  });

  it('sends 24h unpaid template (buttons come from the template itself)', async () => {
    const appt = makeAppt({ paymentStatus: null });
    const { sut, whatsApp } = makeSut(appt);
    const result = await sut.execute({ appointmentId: 'appt-001', type: '24h' });

    expect(result.sent).toBe(true);
    expect(result.templateName).toBe('recordatorio_cita_24h');
    const call = whatsApp.sendTemplate.mock.calls[0]![0];
    // Zernio rejects per-send quick-reply payloads; replies are matched by quoted message.
    expect(call.templateButtonParams).toBeUndefined();
  });

  it('sends 24h paid template without button params', async () => {
    const appt = makeAppt({ paymentStatus: 'approved' });
    const { sut, whatsApp } = makeSut(appt);
    const result = await sut.execute({ appointmentId: 'appt-001', type: '24h' });

    expect(result.templateName).toBe('recordatorio_cita_24h_pagada');
    const call = whatsApp.sendTemplate.mock.calls[0]![0];
    expect(call.templateButtonParams).toBeUndefined();
  });

  it('sends 3h template', async () => {
    const appt = makeAppt();
    const { sut } = makeSut(appt);
    const result = await sut.execute({ appointmentId: 'appt-001', type: '3h' });
    expect(result.templateName).toBe('recordatorio_cita_hoy');
  });

  it('returns sent=false when adapter returns null (gated)', async () => {
    const appt = makeAppt();
    const { sut } = makeSut(appt, null);
    const result = await sut.execute({ appointmentId: 'appt-001', type: '3h' });
    expect(result.sent).toBe(false);
    expect(result.messageId).toBeNull();
  });
});
