import { SendAppointmentReminderEmailUseCase } from './send-appointment-reminder-email.use-case';
import { AppointmentNotFoundForReminderError } from '../../../domain/errors/appointment-not-found-for-reminder.error';
import { PatientEmailMissingError } from '../../../domain/errors/patient-email-missing.error';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeAppointment(
  overrides: Partial<{
    id: string;
    doctorId: string;
    patientId: string | null;
    patientName: string | null;
    patientEmail: string | null;
    scheduledAt: Date;
    planName: string | null;
    appointmentCode: string | null;
  }> = {},
) {
  return {
    id: 'id' in overrides ? overrides.id! : 'apt-1',
    doctorId: 'doctorId' in overrides ? overrides.doctorId! : 'doc-1',
    patientId: 'patientId' in overrides ? overrides.patientId : 'pat-1',
    patientName: 'patientName' in overrides ? overrides.patientName : 'Juan Pérez',
    patientEmail: 'patientEmail' in overrides ? overrides.patientEmail : null,
    scheduledAt: overrides.scheduledAt ?? new Date('2026-07-15T09:00:00Z'),
    planName: 'planName' in overrides ? overrides.planName : 'Consulta General',
    appointmentCode: 'appointmentCode' in overrides ? overrides.appointmentCode : 'APT-0001',
  };
}

function makeConsultation(
  overrides: Partial<{
    id: string;
    doctorId: string;
    appointmentId: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'con-1',
    doctorId: overrides.doctorId ?? 'doc-1',
    appointmentId: overrides.appointmentId ?? 'apt-1',
  };
}

function makeDoctorProfile(overrides: Partial<{ fullName: string }> = {}) {
  return { fullName: overrides.fullName ?? 'Dra. María García' };
}

function makePatient(email: string | null = 'patient@example.com') {
  return { id: 'pat-1', email };
}

// ---------------------------------------------------------------------------
// Factory for the use-case with injectable mocks
// ---------------------------------------------------------------------------

function buildUseCase(opts: {
  appointment?: ReturnType<typeof makeAppointment> | null;
  consultation?: ReturnType<typeof makeConsultation> | null;
  patient?: ReturnType<typeof makePatient> | null;
  doctorProfile?: ReturnType<typeof makeDoctorProfile> | null;
  mailerResult?: object;
  mailerThrows?: Error;
}) {
  const appointmentRepo = {
    findByIdForDoctor: jest.fn().mockResolvedValue(opts.appointment ?? null),
  };

  const consultationRepo = {
    findById: jest.fn().mockResolvedValue(opts.consultation ?? null),
  };

  const patientRepo = {
    findById: jest.fn().mockResolvedValue(opts.patient ?? null),
  };

  const doctorProfileRepo = {
    findByDoctorId: jest.fn().mockResolvedValue(opts.doctorProfile ?? null),
  };

  const mailer = {
    sendTemplate: opts.mailerThrows
      ? jest.fn().mockRejectedValue(opts.mailerThrows)
      : jest.fn().mockResolvedValue(opts.mailerResult ?? { id: 'msg-1' }),
  };

  const useCase = new SendAppointmentReminderEmailUseCase(
    appointmentRepo as never,
    consultationRepo as never,
    patientRepo as never,
    doctorProfileRepo as never,
    mailer as never,
  );

  return { useCase, appointmentRepo, consultationRepo, patientRepo, doctorProfileRepo, mailer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SendAppointmentReminderEmailUseCase', () => {
  const BASE_INPUT = {
    doctorId: 'doc-1',
    appointmentId: 'apt-1',
  };

  describe('happy path — appointment_id provided with appointment.patientEmail', () => {
    it('sends email using appointment.patientEmail and returns { sent: true }', async () => {
      const apt = makeAppointment({ patientEmail: 'juan@example.com' });
      const { useCase, mailer, patientRepo } = buildUseCase({
        appointment: apt,
        doctorProfile: makeDoctorProfile(),
      });

      const result = await useCase.execute(BASE_INPUT);

      expect(result).toEqual({ sent: true });
      // patientRepo.findById must NOT be called — email was on the appointment
      expect(patientRepo.findById).not.toHaveBeenCalled();
      // mailer.sendTemplate must be called with the correct template
      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'reminder_manual',
        'juan@example.com',
        expect.objectContaining({
          patient_name: 'Juan Pérez',
          doctor_name: 'Dra. María García',
          service: 'Consulta General',
          code: 'APT-0001',
        }),
        { type: 'patient', id: 'pat-1' },
      );
    });
  });

  describe('patient email fallback — appointment.patientEmail is null', () => {
    it('fetches patient record and uses patient.email when appointment.patientEmail is null', async () => {
      const apt = makeAppointment({ patientEmail: null });
      const pat = makePatient('fallback@example.com');
      const { useCase, mailer, patientRepo } = buildUseCase({
        appointment: apt,
        patient: pat,
        doctorProfile: makeDoctorProfile(),
      });

      const result = await useCase.execute(BASE_INPUT);

      expect(result).toEqual({ sent: true });
      expect(patientRepo.findById).toHaveBeenCalledWith('pat-1', 'doc-1');
      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'reminder_manual',
        'fallback@example.com',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('consultation_id path — no appointment_id provided', () => {
    it('resolves appointmentId from consultation and sends the email', async () => {
      const apt = makeAppointment({ patientEmail: 'via-consult@example.com' });
      const con = makeConsultation({ appointmentId: 'apt-1' });
      const { useCase, appointmentRepo, consultationRepo, mailer } = buildUseCase({
        appointment: apt,
        consultation: con,
        doctorProfile: makeDoctorProfile(),
      });

      const result = await useCase.execute({
        doctorId: 'doc-1',
        consultationId: 'con-1',
      });

      expect(result).toEqual({ sent: true });
      expect(consultationRepo.findById).toHaveBeenCalledWith('con-1', 'doc-1');
      expect(appointmentRepo.findByIdForDoctor).toHaveBeenCalledWith('apt-1', 'doc-1');
      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'reminder_manual',
        'via-consult@example.com',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('doctor name fallback', () => {
    it('uses "Su médico" when doctor profile is not found', async () => {
      const apt = makeAppointment({ patientEmail: 'p@test.com' });
      const { useCase, mailer } = buildUseCase({
        appointment: apt,
        doctorProfile: null,
      });

      await useCase.execute(BASE_INPUT);

      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'reminder_manual',
        'p@test.com',
        expect.objectContaining({ doctor_name: 'Su médico' }),
        expect.any(Object),
      );
    });
  });

  describe('appointment code fallback', () => {
    it('uses first 8 chars of appointment.id when appointmentCode is null', async () => {
      const apt = makeAppointment({
        id: 'abcdef12-uuid-here',
        patientEmail: 'p@test.com',
        appointmentCode: null,
      });
      const { useCase, mailer } = buildUseCase({
        appointment: apt,
        doctorProfile: makeDoctorProfile(),
      });

      await useCase.execute(BASE_INPUT);

      expect(mailer.sendTemplate).toHaveBeenCalledWith(
        'reminder_manual',
        'p@test.com',
        expect.objectContaining({ code: 'ABCDEF12' }),
        expect.any(Object),
      );
    });
  });

  describe('error: appointment not found (anti-IDOR)', () => {
    it('throws AppointmentNotFoundForReminderError when findByIdForDoctor returns null', async () => {
      const { useCase } = buildUseCase({ appointment: null });

      await expect(useCase.execute(BASE_INPUT)).rejects.toThrow(
        AppointmentNotFoundForReminderError,
      );
    });
  });

  describe('error: consultation not found', () => {
    it('throws AppointmentNotFoundForReminderError when consultation is null', async () => {
      const { useCase } = buildUseCase({ consultation: null });

      await expect(
        useCase.execute({ doctorId: 'doc-1', consultationId: 'con-missing' }),
      ).rejects.toThrow(AppointmentNotFoundForReminderError);
    });

    it('throws AppointmentNotFoundForReminderError when consultation.appointmentId is null', async () => {
      const con = makeConsultation({ appointmentId: null });
      const { useCase } = buildUseCase({ consultation: con });

      await expect(useCase.execute({ doctorId: 'doc-1', consultationId: 'con-1' })).rejects.toThrow(
        AppointmentNotFoundForReminderError,
      );
    });
  });

  describe('error: patient email missing', () => {
    it('throws PatientEmailMissingError when both appointment.patientEmail and patient.email are null', async () => {
      const apt = makeAppointment({ patientEmail: null });
      const pat = makePatient(null);
      const { useCase } = buildUseCase({
        appointment: apt,
        patient: pat,
        doctorProfile: makeDoctorProfile(),
      });

      await expect(useCase.execute(BASE_INPUT)).rejects.toThrow(PatientEmailMissingError);
    });

    it('throws PatientEmailMissingError when appointment.patientId is null and email is null', async () => {
      const apt = makeAppointment({ patientEmail: null, patientId: null });
      const { useCase } = buildUseCase({
        appointment: apt,
        doctorProfile: makeDoctorProfile(),
      });

      await expect(useCase.execute(BASE_INPUT)).rejects.toThrow(PatientEmailMissingError);
    });
  });

  describe('error: mailer failure propagates', () => {
    it('propagates errors from MailerService without swallowing them', async () => {
      const apt = makeAppointment({ patientEmail: 'p@test.com' });
      const sendError = new Error('Resend API error');
      const { useCase } = buildUseCase({
        appointment: apt,
        doctorProfile: makeDoctorProfile(),
        mailerThrows: sendError,
      });

      await expect(useCase.execute(BASE_INPUT)).rejects.toThrow('Resend API error');
    });
  });
});
