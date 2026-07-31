import { SyncDoctorCalendarUseCase } from './sync-doctor-calendar.use-case';
import { CalendarNotConnectedError } from '../../../domain/errors/calendar-not-connected.error';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { GetIntegrationStatusUseCase } from '../../../../integrations/application/use-cases/integrations/get-integration-status.use-case';
import type { CreateCalendarEventUseCase } from '../../../../integrations/application/use-cases/integrations/create-calendar-event.use-case';
import { Appointment } from '../../../domain/entities/appointment.entity';
import type { Office } from '../../../../offices/domain/entities/office.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const now = new Date('2026-08-01T10:00:00Z');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAppointment(
  overrides: Partial<{
    id: string;
    appointmentMode: 'presencial' | 'online';
    officeId: string | null;
    meetLink: string | null;
    googleCalendarEventId: string | null;
  }> = {},
): Appointment {
  return Appointment.create({
    id: overrides.id ?? 'appt-001',
    doctorId: DOCTOR_ID,
    patientId: 'patient-001',
    authUserId: null,
    consultationId: null,
    patientName: 'Nombre Paciente',
    patientPhone: '+58412000000',
    patientEmail: 'paciente@example.com',
    patientCedula: 'V-11111111',
    scheduledAt: new Date(now.getTime() + 86_400_000),
    status: 'scheduled',
    appointmentMode: overrides.appointmentMode ?? 'presencial',
    source: null,
    planName: 'Consulta',
    planPrice: 30,
    paymentMethod: null,
    paymentReference: null,
    paymentReceiptUrl: null,
    insuranceName: null,
    bcvRate: null,
    amountBs: null,
    packageId: null,
    sessionNumber: null,
    chiefComplaint: null,
    appointmentCode: null,
    createdAt: now,
    updatedAt: now,
    meetLink: overrides.meetLink ?? null,
    officeId: overrides.officeId ?? null,
    googleCalendarEventId: overrides.googleCalendarEventId ?? null,
    durationMinutes: 30,
  });
}

function makeOffice(name = 'Consultorio A', address = 'Av. Principal 1'): Office {
  return {
    id: 'office-001',
    doctorId: DOCTOR_ID,
    name,
    address,
    city: 'Caracas',
    state: 'Distrito Capital',
    phone: null,
    isActive: true,
    schedule: null,
  } as unknown as Office;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeAppointmentRepo(upcoming: Appointment[] = []): jest.Mocked<IAppointmentRepository> {
  return {
    findById: jest.fn(),
    findByIdForDoctor: jest.fn(),
    list: jest.fn(),
    save: jest.fn(),
    updateStatus: jest.fn(),
    updateScheduledAt: jest.fn(),
    hasOverlap: jest.fn(),
    hasPatientOverlap: jest.fn(),
    findPackageById: jest.fn(),
    incrementPackageSessions: jest.fn(),
    logStatusChange: jest.fn(),
    findActiveByDoctorAndDateRange: jest.fn().mockResolvedValue([]),
    updateMeetLink: jest.fn().mockResolvedValue(undefined),
    updateGoogleEventId: jest.fn().mockResolvedValue(undefined),
    updateConsultationId: jest.fn().mockResolvedValue(undefined),
    deleteById: jest.fn().mockResolvedValue(undefined),
    findFirstCompletedByPaymentId: jest.fn().mockResolvedValue(null),
    findUpcomingWithoutCalendarEvent: jest.fn().mockResolvedValue(upcoming),
  } as jest.Mocked<IAppointmentRepository>;
}

function makeOfficeRepo(office: Office | null = null): jest.Mocked<IOfficeRepository> {
  return {
    findById: jest.fn(),
    findByIdForDoctor: jest.fn().mockResolvedValue(office),
    findByDoctor: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    findDoctorPrimary: jest.fn(),
  } as unknown as jest.Mocked<IOfficeRepository>;
}

function makeDoctorProfileRepo(): jest.Mocked<IDoctorProfileRepository> {
  return {
    findByDoctorId: jest.fn().mockResolvedValue({ fullName: 'Dr. House' }),
    save: jest.fn(),
    updateSignature: jest.fn(),
  } as unknown as jest.Mocked<IDoctorProfileRepository>;
}

function makeIntegrationStatus(connected: boolean): jest.Mocked<GetIntegrationStatusUseCase> {
  return {
    execute: jest.fn().mockResolvedValue({ connected }),
  } as unknown as jest.Mocked<GetIntegrationStatusUseCase>;
}

function makeCreateCalendarEvent(
  eventId = 'gcal-event-id',
  meetLink = '',
): jest.Mocked<CreateCalendarEventUseCase> {
  return {
    execute: jest.fn().mockResolvedValue({ eventId, meetLink }),
  } as unknown as jest.Mocked<CreateCalendarEventUseCase>;
}

function buildUseCase(deps: {
  appointmentRepo?: jest.Mocked<IAppointmentRepository>;
  officeRepo?: jest.Mocked<IOfficeRepository>;
  doctorProfileRepo?: jest.Mocked<IDoctorProfileRepository>;
  integrationStatus?: jest.Mocked<GetIntegrationStatusUseCase>;
  createCalendarEvent?: jest.Mocked<CreateCalendarEventUseCase>;
}) {
  return new SyncDoctorCalendarUseCase(
    deps.appointmentRepo ?? makeAppointmentRepo(),
    deps.officeRepo ?? makeOfficeRepo(),
    deps.doctorProfileRepo ?? makeDoctorProfileRepo(),
    deps.integrationStatus ?? makeIntegrationStatus(true),
    deps.createCalendarEvent ?? makeCreateCalendarEvent(),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncDoctorCalendarUseCase', () => {
  it('throws CalendarNotConnectedError and never calls createCalendarEvent when Google is not connected', async () => {
    const createCalendarEvent = makeCreateCalendarEvent();
    const useCase = buildUseCase({
      integrationStatus: makeIntegrationStatus(false),
      appointmentRepo: makeAppointmentRepo([makeAppointment()]),
      createCalendarEvent,
    });

    await expect(useCase.execute(DOCTOR_ID)).rejects.toBeInstanceOf(CalendarNotConnectedError);
    expect(createCalendarEvent.execute).not.toHaveBeenCalled();
  });

  it('returns { total: 0, synced: 0, failed: 0 } when there are no pending appointments', async () => {
    const useCase = buildUseCase({
      integrationStatus: makeIntegrationStatus(true),
      appointmentRepo: makeAppointmentRepo([]),
    });

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual({ total: 0, synced: 0, failed: 0 });
  });

  it('calls createCalendarEvent with withMeet:false and office location for presencial appointments', async () => {
    const office = makeOffice('Clínica Norte', 'Av. Norte 42');
    const appt = makeAppointment({ appointmentMode: 'presencial', officeId: 'office-001' });
    const appointmentRepo = makeAppointmentRepo([appt]);
    const officeRepo = makeOfficeRepo(office);
    const createCalendarEvent = makeCreateCalendarEvent('gcal-event-1');

    const useCase = buildUseCase({ appointmentRepo, officeRepo, createCalendarEvent });
    const result = await useCase.execute(DOCTOR_ID);

    expect(createCalendarEvent.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        withMeet: false,
        location: 'Av. Norte 42',
      }),
    );
    // Must NOT send patient's email to Google Calendar (anti-PII).
    expect(createCalendarEvent.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ attendeeEmail: expect.anything() }),
    );
    expect(appointmentRepo.updateGoogleEventId).toHaveBeenCalledWith(appt.id, 'gcal-event-1');
    expect(result).toEqual({ total: 1, synced: 1, failed: 0 });
  });

  it('calls createCalendarEvent with withMeet:true and persists meetLink for online appointments without one', async () => {
    const appt = makeAppointment({ appointmentMode: 'online', meetLink: null });
    const appointmentRepo = makeAppointmentRepo([appt]);
    const createCalendarEvent = makeCreateCalendarEvent(
      'gcal-event-2',
      'https://meet.google.com/abc-def',
    );

    const useCase = buildUseCase({ appointmentRepo, createCalendarEvent });
    const result = await useCase.execute(DOCTOR_ID);

    expect(createCalendarEvent.execute).toHaveBeenCalledWith(
      expect.objectContaining({ withMeet: true }),
    );
    expect(appointmentRepo.updateGoogleEventId).toHaveBeenCalledWith(appt.id, 'gcal-event-2');
    expect(appointmentRepo.updateMeetLink).toHaveBeenCalledWith(
      appt.id,
      'https://meet.google.com/abc-def',
    );
    expect(result).toEqual({ total: 1, synced: 1, failed: 0 });
  });

  it('does NOT call updateMeetLink when the appointment already has a meetLink', async () => {
    const appt = makeAppointment({
      appointmentMode: 'online',
      meetLink: 'https://meet.google.com/existing',
    });
    const appointmentRepo = makeAppointmentRepo([appt]);
    const createCalendarEvent = makeCreateCalendarEvent(
      'gcal-event-3',
      'https://meet.google.com/new',
    );

    const useCase = buildUseCase({ appointmentRepo, createCalendarEvent });
    await useCase.execute(DOCTOR_ID);

    expect(appointmentRepo.updateMeetLink).not.toHaveBeenCalled();
  });

  it('counts appointment in failed and continues when one throws mid-batch', async () => {
    const failing = makeAppointment({ id: 'appt-fail' });
    const succeeding = makeAppointment({ id: 'appt-ok', appointmentMode: 'presencial' });
    const appointmentRepo = makeAppointmentRepo([failing, succeeding]);
    const createCalendarEvent = {
      execute: jest
        .fn()
        .mockRejectedValueOnce(new Error('Google API error'))
        .mockResolvedValueOnce({ eventId: 'gcal-event-ok', meetLink: '' }),
    } as unknown as jest.Mocked<CreateCalendarEventUseCase>;

    const useCase = buildUseCase({ appointmentRepo, createCalendarEvent });
    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual({ total: 2, synced: 1, failed: 1 });
    expect(appointmentRepo.updateGoogleEventId).toHaveBeenCalledTimes(1);
    expect(appointmentRepo.updateGoogleEventId).toHaveBeenCalledWith('appt-ok', 'gcal-event-ok');
  });

  it('counts appointment in failed and does NOT persist when Google returns no eventId', async () => {
    const appt = makeAppointment();
    const appointmentRepo = makeAppointmentRepo([appt]);
    const createCalendarEvent = makeCreateCalendarEvent('', ''); // empty eventId

    const useCase = buildUseCase({ appointmentRepo, createCalendarEvent });
    const result = await useCase.execute(DOCTOR_ID);

    expect(appointmentRepo.updateGoogleEventId).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, synced: 0, failed: 1 });
  });

  it('syncs appointment without location when the office cannot be resolved (not counted as failed)', async () => {
    const appt = makeAppointment({ appointmentMode: 'presencial', officeId: 'office-missing' });
    const appointmentRepo = makeAppointmentRepo([appt]);
    // Office repo returns null → unresolved office.
    const officeRepo = makeOfficeRepo(null);
    const createCalendarEvent = makeCreateCalendarEvent('gcal-event-noloc');

    const useCase = buildUseCase({ appointmentRepo, officeRepo, createCalendarEvent });
    const result = await useCase.execute(DOCTOR_ID);

    // Should sync successfully even without location.
    expect(result).toEqual({ total: 1, synced: 1, failed: 0 });
    expect(appointmentRepo.updateGoogleEventId).toHaveBeenCalledWith(appt.id, 'gcal-event-noloc');
    // location must be undefined (not set), not a stale value from a previous appointment.
    expect(createCalendarEvent.execute).toHaveBeenCalledWith(
      expect.not.objectContaining({ location: expect.any(String) }),
    );
  });

  it('does NOT include PII in the calendar event summary or description', async () => {
    const appt = makeAppointment({ appointmentMode: 'presencial' });
    const appointmentRepo = makeAppointmentRepo([appt]);
    const createCalendarEvent = makeCreateCalendarEvent('gcal-event-pii');

    const useCase = buildUseCase({ appointmentRepo, createCalendarEvent });
    await useCase.execute(DOCTOR_ID);

    const call = (createCalendarEvent.execute as jest.Mock).mock.calls[0][0] as {
      summary: string;
      description: string;
    };
    // Patient PII that MUST NOT appear in the event.
    expect(call.summary).not.toContain('Nombre Paciente');
    expect(call.summary).not.toContain('paciente@example.com');
    expect(call.description).not.toContain('Nombre Paciente');
    expect(call.description).not.toContain('paciente@example.com');
    expect(call.description).not.toContain('V-11111111');
  });
});
