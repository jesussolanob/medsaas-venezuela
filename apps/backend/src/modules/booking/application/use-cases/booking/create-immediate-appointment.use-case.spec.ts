import { CreateImmediateAppointmentUseCase } from './create-immediate-appointment.use-case';
import { GetImmediateWindowUseCase } from './get-immediate-window.use-case';
import { CreateBookingUseCase } from './create-booking.use-case';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { Test } from '@nestjs/testing';
import type { Patient } from '../../../../patients/domain/entities/patient.entity';
import type { Appointment } from '../../../../appointments/domain/entities/appointment.entity';
import { NoImmediateSlotError } from '../../../domain/errors/no-immediate-slot.error';
import { PatientNotFoundError } from './create-booking.use-case';
import type { CreateImmediateAppointmentDto } from '@delta/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: 'patient-uuid',
    doctorId: 'doctor-uuid',
    fullName: 'María López',
    cedula: 'V-12345678',
    email: null,
    phone: null,
    source: 'manual',
    ...overrides,
  } as unknown as Patient;
}

function makeSavedAppt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-uuid',
    doctorId: 'doctor-uuid',
    scheduledAt: new Date(),
    ...overrides,
  } as unknown as Appointment;
}

function makeBaseDto(
  overrides: Partial<CreateImmediateAppointmentDto> = {},
): CreateImmediateAppointmentDto {
  return {
    office_id: 'office-uuid',
    patient_id: 'patient-uuid',
    appointment_mode: 'presencial',
    plan_name: 'Consulta General',
    plan_price: 40,
    duration_minutes: 30,
    force: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateImmediateAppointmentUseCase', () => {
  const DOCTOR_ID = 'doctor-uuid';
  const NOW = new Date('2025-08-15T14:00:00.000Z');

  let useCase: CreateImmediateAppointmentUseCase;
  let patientRepoMock: jest.Mocked<IPatientRepository>;
  let getWindowMock: jest.Mocked<GetImmediateWindowUseCase>;
  let createBookingMock: jest.Mocked<CreateBookingUseCase>;

  beforeEach(async () => {
    patientRepoMock = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<IPatientRepository>;

    getWindowMock = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetImmediateWindowUseCase>;

    createBookingMock = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateBookingUseCase>;

    const module = await Test.createTestingModule({
      providers: [
        CreateImmediateAppointmentUseCase,
        { provide: PATIENT_REPOSITORY, useValue: patientRepoMock },
        { provide: GetImmediateWindowUseCase, useValue: getWindowMock },
        { provide: CreateBookingUseCase, useValue: createBookingMock },
      ],
    }).compile();

    useCase = module.get(CreateImmediateAppointmentUseCase);
  });

  describe('patient anti-IDOR', () => {
    it('throws PatientNotFoundError when patient does not belong to the doctor', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(null);

      await expect(useCase.execute(DOCTOR_ID, makeBaseDto())).rejects.toBeInstanceOf(
        PatientNotFoundError,
      );

      expect(patientRepoMock.findById).toHaveBeenCalledWith('patient-uuid', DOCTOR_ID);
    });
  });

  describe('without next appointment (calendar empty)', () => {
    it('uses full duration_minutes and creates the appointment', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: null,
        availableMinutes: 30, // matches durationMinutes
        effectiveDuration: 30,
        fits: true,
      });
      const savedAppt = makeSavedAppt({ scheduledAt: NOW });
      createBookingMock.execute.mockResolvedValueOnce({
        appointment: savedAppt,
        patient: makePatient(),
        appointmentCode: 'BK-20250815-123456-ABCD',
        meetLink: null,
      });

      const result = await useCase.execute(DOCTOR_ID, makeBaseDto());

      expect(result.effectiveDuration).toBe(30);
      expect(result.appointmentCode).toBe('BK-20250815-123456-ABCD');
    });

    it('passes the server-side now as scheduled_at (ignores client timestamp)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: null,
        availableMinutes: 30,
        effectiveDuration: 30,
        fits: true,
      });
      createBookingMock.execute.mockResolvedValueOnce({
        appointment: makeSavedAppt({ scheduledAt: NOW }),
        patient: makePatient(),
        appointmentCode: 'BK-X',
        meetLink: null,
      });

      await useCase.execute(
        DOCTOR_ID,
        makeBaseDto({
          // Even if a rogue client somehow injected a scheduled_at, we don't have
          // that field in the DTO — it is always server-side NOW from the window.
          duration_minutes: 30,
        }),
      );

      const bookingCall = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingCall.scheduled_at).toBe(NOW.toISOString());
    });
  });

  describe('next appointment in 23 minutes (service = 30 min)', () => {
    const NEXT_AT = new Date(NOW.getTime() + 23 * 60_000);

    it('truncates effective duration to 23 minutes', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: NEXT_AT,
        availableMinutes: 23,
        effectiveDuration: 23, // min(30, 23) = 23
        fits: false,
      });
      createBookingMock.execute.mockResolvedValueOnce({
        appointment: makeSavedAppt({ scheduledAt: NOW }),
        patient: makePatient(),
        appointmentCode: 'BK-Y',
        meetLink: null,
      });

      const result = await useCase.execute(DOCTOR_ID, makeBaseDto());

      expect(result.effectiveDuration).toBe(23);
      const bookingCall = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingCall.duration_minutes).toBe(23);
    });
  });

  describe('next appointment in 2 minutes — no force', () => {
    it('throws NoImmediateSlotError (< 5 minutes available)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: new Date(NOW.getTime() + 2 * 60_000),
        availableMinutes: 2,
        effectiveDuration: 2, // min(30, 2) = 2 — below MIN_IMMEDIATE_MINUTES
        fits: false,
      });

      await expect(
        useCase.execute(DOCTOR_ID, makeBaseDto({ force: false })),
      ).rejects.toBeInstanceOf(NoImmediateSlotError);

      expect(createBookingMock.execute).not.toHaveBeenCalled();
    });
  });

  describe('force=true', () => {
    it('uses full duration_minutes and sets skipDoctorOverlapCheck=true', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: new Date(NOW.getTime() + 2 * 60_000),
        availableMinutes: 2,
        effectiveDuration: 2,
        fits: false,
      });
      createBookingMock.execute.mockResolvedValueOnce({
        appointment: makeSavedAppt({ scheduledAt: NOW }),
        patient: makePatient(),
        appointmentCode: 'BK-Z',
        meetLink: null,
      });

      const result = await useCase.execute(
        DOCTOR_ID,
        makeBaseDto({ duration_minutes: 30, force: true }),
      );

      // force → full duration, not truncated
      expect(result.effectiveDuration).toBe(30);

      const [, options] = createBookingMock.execute.mock.calls[0]!;
      expect(options?.skipDoctorOverlapCheck).toBe(true);
    });

    it('still uses duration_minutes (not availableMinutes) for the DTO', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: new Date(NOW.getTime() + 10 * 60_000),
        availableMinutes: 10,
        effectiveDuration: 10, // window would truncate but force overrides
        fits: false,
      });
      createBookingMock.execute.mockResolvedValueOnce({
        appointment: makeSavedAppt({ scheduledAt: NOW }),
        patient: makePatient(),
        appointmentCode: 'BK-FORCE',
        meetLink: null,
      });

      await useCase.execute(DOCTOR_ID, makeBaseDto({ duration_minutes: 45, force: true }));

      const bookingDto = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingDto.duration_minutes).toBe(45);
    });
  });

  describe('doctorId security', () => {
    it('always passes the authenticated doctorId to CreateBookingUseCase (anti-IDOR)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce({
        now: NOW,
        nextAppointmentAt: null,
        availableMinutes: 30,
        effectiveDuration: 30,
        fits: true,
      });
      createBookingMock.execute.mockResolvedValueOnce({
        appointment: makeSavedAppt({ scheduledAt: NOW }),
        patient: makePatient(),
        appointmentCode: 'BK-ID',
        meetLink: null,
      });

      await useCase.execute(DOCTOR_ID, makeBaseDto());

      const bookingDto = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingDto.doctor_id).toBe(DOCTOR_ID);
    });
  });
});
