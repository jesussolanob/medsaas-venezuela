import { Test, TestingModule } from '@nestjs/testing';
import { DoctorBookingController } from './doctor-booking.controller';
import { CreateBookingUseCase } from '../../application/use-cases/booking/create-booking.use-case';
import { GetImmediateWindowUseCase } from '../../application/use-cases/booking/get-immediate-window.use-case';
import { CreateImmediateAppointmentUseCase } from '../../application/use-cases/booking/create-immediate-appointment.use-case';
import type { CreateBookingDto } from '@delta/shared-types';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';

/**
 * Este controller NO tenía spec —el público sí— y por eso sobrevivió un defecto
 * que solo se veía en pantalla: el use case creaba la consulta y devolvía su id,
 * y el handler lo descartaba al armar la respuesta. Con `consultationId: null`
 * el especialista que registraba una consulta de una fecha pasada quedaba en
 * "Cita agendada" sin forma de abrir lo que iba a escribir.
 *
 * El foco de estas pruebas es el CONTRATO de la respuesta: qué campos promete
 * este endpoint. Un campo que se cae en el mapeo no rompe ningún test de use
 * case, y es exactamente la clase de error que ya costó una sesión de QA.
 */
describe('DoctorBookingController', () => {
  const DOCTOR_ID = '21de7d48-3065-416e-95a6-2ae71906d18d';
  const USER: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor' } as CurrentUserPayload;

  const DTO = {
    cf_turnstile_token: 'internal-doctor-auth',
    doctor_id: 'este-id-se-descarta',
    patient_id: '1d97de32-0a1a-41d4-88f6-9363888fe7a1',
    scheduled_at: '2026-08-21T14:00:00.000Z',
    appointment_mode: 'presencial',
    plan_name: 'Consulta',
    plan_price: 40,
  } as unknown as CreateBookingDto;

  function buildResult(consultationId: string | null) {
    return {
      appointment: {
        id: 'appt-uuid-0001',
        scheduledAt: '2026-08-21T14:00:00.000Z',
      },
      patient: { id: DTO.patient_id },
      appointmentCode: 'BK-20260824-190357-C3F5',
      meetLink: null,
      consultationId,
      consultationCode: consultationId ? 'DLT-202608-0030' : null,
    };
  }

  let controller: DoctorBookingController;
  let createBooking: { execute: jest.Mock };

  beforeEach(async () => {
    createBooking = { execute: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DoctorBookingController],
      providers: [
        { provide: CreateBookingUseCase, useValue: createBooking },
        { provide: GetImmediateWindowUseCase, useValue: { execute: jest.fn() } },
        { provide: CreateImmediateAppointmentUseCase, useValue: { execute: jest.fn() } },
      ],
    })
      // Los guards se anulan porque acá se prueba el CONTRATO DE LA RESPUESTA,
      // no la autenticación: instanciarlos de verdad arrastraría ConfigService,
      // Auth0Guard y el puerto de estado de cuenta. El RBAC de este controller
      // (`@Roles('doctor','super_admin')`) vive en las pruebas de RolesGuard.
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(DoctorBookingController);
  });

  it('devuelve el consultationId que produjo el use case', async () => {
    createBooking.execute.mockResolvedValue(buildResult('cons-uuid-0030'));

    const res = (await controller.create(DTO, USER)) as {
      data: { consultationId: string | null };
    };

    expect(res.data.consultationId).toBe('cons-uuid-0030');
  });

  it('propaga null cuando no se pudo crear la consulta, sin romper el alta', async () => {
    // La creación de la consulta es best-effort: si falla, la cita igual existe.
    // El contrato tiene que distinguir "no hay consulta" de "no te la mando".
    createBooking.execute.mockResolvedValue(buildResult(null));

    const res = (await controller.create(DTO, USER)) as {
      data: { consultationId: string | null; appointmentId: string };
    };

    expect(res.data.consultationId).toBeNull();
    expect(res.data.appointmentId).toBe('appt-uuid-0001');
  });

  it('promete los cinco campos del contrato', async () => {
    createBooking.execute.mockResolvedValue(buildResult('cons-uuid-0030'));

    const res = (await controller.create(DTO, USER)) as { data: Record<string, unknown> };

    expect(Object.keys(res.data).sort()).toEqual(
      ['appointmentCode', 'appointmentId', 'consultationId', 'meetLink', 'scheduledAt'].sort(),
    );
  });

  it('anti-IDOR: el doctor_id sale de la sesión y NO del cuerpo', async () => {
    createBooking.execute.mockResolvedValue(buildResult('cons-uuid-0030'));

    await controller.create(DTO, USER);

    expect(createBooking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ doctor_id: DOCTOR_ID }),
      expect.objectContaining({ doctorInitiated: true }),
    );
  });
});
