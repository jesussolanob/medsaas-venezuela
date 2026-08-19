import { CreateImmediateAppointmentUseCase } from './create-immediate-appointment.use-case';
import { GetImmediateWindowUseCase } from './get-immediate-window.use-case';
import { CreateBookingUseCase } from './create-booking.use-case';
import { PATIENT_REPOSITORY } from '../../../../patients/domain/repositories/patient.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { PENDING_CONSULTATION_REPOSITORY } from '../../../../pending-consultations/domain/repositories/pending-consultation.repository';
import type { IPendingConsultationRepository } from '../../../../pending-consultations/domain/repositories/pending-consultation.repository';
import { PendingConsultationNotFoundError } from '../../../../pending-consultations/domain/errors/pending-consultation-not-found.error';
import { PendingConsultationExpiredError } from '../../../../pending-consultations/domain/errors/pending-consultation-expired.error';
import { PendingConsultationNotSchedulableError } from '../../../../pending-consultations/domain/errors/pending-consultation-not-schedulable.error';
import type { PendingConsultation } from '../../../../pending-consultations/domain/entities/pending-consultation.entity';
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
    consultationId: null,
    ...overrides,
  } as unknown as Appointment;
}

function makePending(
  overrides: Partial<PendingConsultation> = {},
): jest.Mocked<PendingConsultation> {
  const pending = {
    id: 'pending-uuid',
    doctorId: 'doctor-uuid',
    patientId: 'patient-uuid',
    planName: 'Combo 3 Sesiones',
    packageId: 'package-uuid',
    paymentId: 'payment-uuid',
    sessionNumber: 2,
    status: 'pending_scheduling',
    expiresAt: null,
    scheduledAppointmentId: null,
    consultationId: null,
    isSchedulable: jest.fn().mockReturnValue(true),
    markScheduled: jest.fn().mockReturnThis(),
    ...overrides,
  };
  return pending as unknown as jest.Mocked<PendingConsultation>;
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

function makeWindowResult(overrides = {}) {
  return {
    now: new Date('2025-08-15T14:00:00.000Z'),
    nextAppointmentAt: null,
    availableMinutes: 30,
    effectiveDuration: 30,
    fits: true,
    ...overrides,
  };
}

function makeBookingResult(
  appt: Appointment,
  patient: Patient,
  consultationId: string | null = 'cons-uuid-0001',
) {
  return {
    appointment: appt,
    patient,
    appointmentCode: 'BK-20250815-123456-ABCD',
    meetLink: null,
    // La consulta viene del resultado, NO de appointment.consultationId: el FK
    // se actualiza en la BD después de construir la entidad.
    consultationId,
    consultationCode: consultationId ? 'DLT-202508-0001' : null,
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
  let pendingRepoMock: jest.Mocked<IPendingConsultationRepository>;
  let getWindowMock: jest.Mocked<GetImmediateWindowUseCase>;
  let createBookingMock: jest.Mocked<CreateBookingUseCase>;

  beforeEach(async () => {
    patientRepoMock = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<IPatientRepository>;

    pendingRepoMock = {
      findByIdAndDoctor: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IPendingConsultationRepository>;

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
        { provide: PENDING_CONSULTATION_REPOSITORY, useValue: pendingRepoMock },
        { provide: GetImmediateWindowUseCase, useValue: getWindowMock },
        { provide: CreateBookingUseCase, useValue: createBookingMock },
      ],
    }).compile();

    useCase = module.get(CreateImmediateAppointmentUseCase);
  });

  // -------------------------------------------------------------------------
  // Existing E2 tests
  // -------------------------------------------------------------------------

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
      getWindowMock.execute.mockResolvedValueOnce(makeWindowResult());
      const savedAppt = makeSavedAppt({ scheduledAt: NOW });
      createBookingMock.execute.mockResolvedValueOnce(makeBookingResult(savedAppt, makePatient()));

      const result = await useCase.execute(DOCTOR_ID, makeBaseDto());

      expect(result.effectiveDuration).toBe(30);
      expect(result.appointmentCode).toBe('BK-20250815-123456-ABCD');
    });

    it('passes the server-side now as scheduled_at (ignores client timestamp)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(makeWindowResult({ now: NOW }));
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      await useCase.execute(DOCTOR_ID, makeBaseDto({ duration_minutes: 30 }));

      const bookingCall = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingCall.scheduled_at).toBe(NOW.toISOString());
    });
  });

  describe('next appointment in 23 minutes (service = 30 min)', () => {
    const NEXT_AT = new Date(NOW.getTime() + 23 * 60_000);

    it('truncates effective duration to 23 minutes', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(
        makeWindowResult({
          nextAppointmentAt: NEXT_AT,
          availableMinutes: 23,
          effectiveDuration: 23,
          fits: false,
        }),
      );
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      const result = await useCase.execute(DOCTOR_ID, makeBaseDto());

      expect(result.effectiveDuration).toBe(23);
      const bookingCall = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingCall.duration_minutes).toBe(23);
    });
  });

  describe('next appointment in 2 minutes — no force', () => {
    it('throws NoImmediateSlotError (< 5 minutes available)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(
        makeWindowResult({
          nextAppointmentAt: new Date(NOW.getTime() + 2 * 60_000),
          availableMinutes: 2,
          effectiveDuration: 2,
          fits: false,
        }),
      );

      await expect(
        useCase.execute(DOCTOR_ID, makeBaseDto({ force: false })),
      ).rejects.toBeInstanceOf(NoImmediateSlotError);

      expect(createBookingMock.execute).not.toHaveBeenCalled();
    });
  });

  describe('force=true', () => {
    it('uses full duration_minutes and sets skipDoctorOverlapCheck=true', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(
        makeWindowResult({
          nextAppointmentAt: new Date(NOW.getTime() + 2 * 60_000),
          availableMinutes: 2,
          effectiveDuration: 2,
          fits: false,
        }),
      );
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      const result = await useCase.execute(
        DOCTOR_ID,
        makeBaseDto({ duration_minutes: 30, force: true }),
      );

      expect(result.effectiveDuration).toBe(30);

      const [, options] = createBookingMock.execute.mock.calls[0]!;
      expect(options?.skipDoctorOverlapCheck).toBe(true);
    });

    it('still uses duration_minutes (not availableMinutes) for the DTO', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(
        makeWindowResult({
          nextAppointmentAt: new Date(NOW.getTime() + 10 * 60_000),
          availableMinutes: 10,
          effectiveDuration: 10,
          fits: false,
        }),
      );
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      await useCase.execute(DOCTOR_ID, makeBaseDto({ duration_minutes: 45, force: true }));

      const bookingDto = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingDto.duration_minutes).toBe(45);
    });
  });

  // -------------------------------------------------------------------------
  // forceConfirmed: la consulta inmediata nace confirmada
  // -------------------------------------------------------------------------

  describe('forceConfirmed — la consulta inmediata nace confirmada', () => {
    it('pasa forceConfirmed=true a CreateBookingUseCase para que la cita nazca confirmed', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(makeWindowResult({ now: NOW }));
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      await useCase.execute(DOCTOR_ID, makeBaseDto());

      const [, options] = createBookingMock.execute.mock.calls[0]!;
      expect(options?.forceConfirmed).toBe(true);
    });

    it('NO pasa doctorInitiated (evita que la cita nazca completed por ser del pasado inmediato)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(makeWindowResult({ now: NOW }));
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      await useCase.execute(DOCTOR_ID, makeBaseDto());

      const [, options] = createBookingMock.execute.mock.calls[0]!;
      expect(options?.doctorInitiated).toBeFalsy();
    });
  });

  describe('doctorId security', () => {
    it('always passes the authenticated doctorId to CreateBookingUseCase (anti-IDOR)', async () => {
      patientRepoMock.findById.mockResolvedValueOnce(makePatient());
      getWindowMock.execute.mockResolvedValueOnce(makeWindowResult());
      createBookingMock.execute.mockResolvedValueOnce(
        makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
      );

      await useCase.execute(DOCTOR_ID, makeBaseDto());

      const bookingDto = createBookingMock.execute.mock.calls[0]![0];
      expect(bookingDto.doctor_id).toBe(DOCTOR_ID);
    });
  });

  // -------------------------------------------------------------------------
  // E3 — Pending consultation (pre-paid session) path
  // -------------------------------------------------------------------------

  describe('pending_consultation_id — E3 pre-paid session path', () => {
    const DTO_WITH_PENDING = makeBaseDto({ pending_consultation_id: 'pending-uuid' });

    describe('anti-IDOR: pending belongs to different doctor', () => {
      it('throws PendingConsultationNotFoundError when pending not found or wrong doctor', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(null);

        await expect(useCase.execute(DOCTOR_ID, DTO_WITH_PENDING)).rejects.toBeInstanceOf(
          PendingConsultationNotFoundError,
        );

        expect(pendingRepoMock.findByIdAndDoctor).toHaveBeenCalledWith('pending-uuid', DOCTOR_ID);
        expect(createBookingMock.execute).not.toHaveBeenCalled();
      });
    });

    describe('anti-IDOR: pending belongs to different patient', () => {
      it('throws PendingConsultationNotFoundError (same error to prevent enumeration)', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        // Pending found but belongs to a DIFFERENT patient
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(
          makePending({ patientId: 'other-patient-uuid' }),
        );

        await expect(useCase.execute(DOCTOR_ID, DTO_WITH_PENDING)).rejects.toBeInstanceOf(
          PendingConsultationNotFoundError,
        );

        expect(createBookingMock.execute).not.toHaveBeenCalled();
      });
    });

    describe('expired pending consultation', () => {
      it('throws PendingConsultationExpiredError when expiresAt is in the past', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        const expiredPast = new Date(Date.now() - 24 * 60 * 60_000); // yesterday
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(
          makePending({
            expiresAt: expiredPast,
            isSchedulable: jest.fn().mockReturnValue(false),
          }),
        );

        await expect(useCase.execute(DOCTOR_ID, DTO_WITH_PENDING)).rejects.toBeInstanceOf(
          PendingConsultationExpiredError,
        );

        expect(createBookingMock.execute).not.toHaveBeenCalled();
      });
    });

    describe('pending consultation already scheduled or cancelled', () => {
      it('throws PendingConsultationNotSchedulableError when status is not pending_scheduling', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(
          makePending({
            status: 'scheduled' as never,
            isSchedulable: jest.fn().mockReturnValue(false),
          }),
        );

        await expect(useCase.execute(DOCTOR_ID, DTO_WITH_PENDING)).rejects.toBeInstanceOf(
          PendingConsultationNotSchedulableError,
        );

        expect(createBookingMock.execute).not.toHaveBeenCalled();
      });
    });

    describe('happy path — pre-paid session consumed', () => {
      it('creates the appointment and marks the pending as scheduled', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        const pending = makePending();
        const markedScheduled = makePending({ status: 'scheduled' as never });
        pending.markScheduled.mockReturnValue(markedScheduled as unknown as PendingConsultation);
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(pending);
        pendingRepoMock.save.mockResolvedValueOnce(
          markedScheduled as unknown as PendingConsultation,
        );
        getWindowMock.execute.mockResolvedValueOnce(makeWindowResult({ now: NOW }));
        const savedAppt = makeSavedAppt({ id: 'new-appt-id', scheduledAt: NOW });
        createBookingMock.execute.mockResolvedValueOnce(
          makeBookingResult(savedAppt, makePatient()),
        );

        const result = await useCase.execute(DOCTOR_ID, DTO_WITH_PENDING);

        // Appointment was created
        expect(result.appointmentId).toBe('new-appt-id');

        // Pending was marked as scheduled AFTER the appointment, enlazada a la
        // consulta que se creó con ella. El id sale del RESULTADO del booking:
        // `appointment.consultationId` todavía viene en null porque el FK se
        // actualiza en la BD después de construir la entidad.
        expect(pending.markScheduled).toHaveBeenCalledWith('new-appt-id', 'cons-uuid-0001');
        expect(pendingRepoMock.save).toHaveBeenCalledWith(markedScheduled);
      });

      it('uses plan_name from the pending row (ignores DTO plan_name)', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        const pending = makePending({ planName: 'Combo 3 Sesiones' });
        pending.markScheduled.mockReturnValue(pending as unknown as PendingConsultation);
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(pending);
        pendingRepoMock.save.mockResolvedValueOnce(pending as unknown as PendingConsultation);
        getWindowMock.execute.mockResolvedValueOnce(makeWindowResult({ now: NOW }));
        createBookingMock.execute.mockResolvedValueOnce(
          makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
        );

        await useCase.execute(
          DOCTOR_ID,
          // Client sends a DIFFERENT plan_name — must be ignored
          makeBaseDto({ pending_consultation_id: 'pending-uuid', plan_name: 'Consulta Suelta' }),
        );

        const bookingDto = createBookingMock.execute.mock.calls[0]![0];
        // plan_name must come from the pending row
        expect(bookingDto.plan_name).toBe('Combo 3 Sesiones');
        // plan_price must be 0 (already paid)
        expect(bookingDto.plan_price).toBe(0);
      });

      it('applies the same duration truncation as without pending (23-min window)', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        const pending = makePending();
        pending.markScheduled.mockReturnValue(pending as unknown as PendingConsultation);
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(pending);
        pendingRepoMock.save.mockResolvedValueOnce(pending as unknown as PendingConsultation);
        const NEXT_AT = new Date(NOW.getTime() + 23 * 60_000);
        getWindowMock.execute.mockResolvedValueOnce(
          makeWindowResult({
            now: NOW,
            nextAppointmentAt: NEXT_AT,
            availableMinutes: 23,
            effectiveDuration: 23,
            fits: false,
          }),
        );
        createBookingMock.execute.mockResolvedValueOnce(
          makeBookingResult(makeSavedAppt({ scheduledAt: NOW }), makePatient()),
        );

        const result = await useCase.execute(DOCTOR_ID, DTO_WITH_PENDING);

        expect(result.effectiveDuration).toBe(23);
      });
    });

    describe('booking failure — pending stays in pending_scheduling', () => {
      it('does NOT mark pending as scheduled if CreateBookingUseCase throws', async () => {
        patientRepoMock.findById.mockResolvedValueOnce(makePatient());
        const pending = makePending();
        pendingRepoMock.findByIdAndDoctor.mockResolvedValueOnce(pending);
        getWindowMock.execute.mockResolvedValueOnce(makeWindowResult({ now: NOW }));
        createBookingMock.execute.mockRejectedValueOnce(new Error('DB error'));

        await expect(useCase.execute(DOCTOR_ID, DTO_WITH_PENDING)).rejects.toThrow('DB error');

        // The pending consultation must NOT have been marked as scheduled
        expect(pending.markScheduled).not.toHaveBeenCalled();
        expect(pendingRepoMock.save).not.toHaveBeenCalled();
      });
    });
  });
});
