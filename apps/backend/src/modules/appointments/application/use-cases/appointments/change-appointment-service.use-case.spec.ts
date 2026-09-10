import { ChangeAppointmentServiceUseCase } from './change-appointment-service.use-case';
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository';
import type { IPricingPlanRepository } from '../../../../packages/domain/repositories/pricing-plan.repository';
import { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import {
  Appointment,
  type AppointmentCreateParams,
} from '../../../domain/entities/appointment.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { ServiceChangeNotEquivalentError } from '../../../domain/errors/service-change-not-equivalent.error';
import { ServiceNotAvailableError } from '../../../domain/errors/service-not-available.error';

const DOCTOR_ID = 'doctor-uuid-1';
const APPT_ID = 'appt-uuid-1';
const OLD_PLAN_ID = 'plan-old-uuid';
const NEW_PLAN_ID = 'plan-new-uuid';
const NOW = new Date('2026-09-10T10:00:00Z');

function makeAppointment(overrides: Partial<AppointmentCreateParams> = {}): Appointment {
  return Appointment.create({
    id: APPT_ID,
    doctorId: DOCTOR_ID,
    patientId: 'patient-1',
    scheduledAt: NOW,
    status: 'confirmed',
    appointmentMode: 'presencial',
    planId: OLD_PLAN_ID,
    planName: 'Paquete 4 consultas',
    planPrice: 120,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function makePlan(overrides: Partial<Parameters<typeof PricingPlan.create>[0]> = {}): PricingPlan {
  return PricingPlan.create({
    id: NEW_PLAN_ID,
    doctorId: DOCTOR_ID,
    name: 'Paquete 4 sesiones de fisio',
    priceUsd: 160,
    durationMinutes: 30,
    sessionsCount: 4,
    description: null,
    type: 'plan',
    showInBooking: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

describe('ChangeAppointmentServiceUseCase', () => {
  let appointmentRepo: jest.Mocked<
    Pick<IAppointmentRepository, 'findByIdScopedEnriched' | 'changeService'>
  >;
  let planRepo: jest.Mocked<Pick<IPricingPlanRepository, 'findById' | 'findAllByDoctorId'>>;
  let useCase: ChangeAppointmentServiceUseCase;

  beforeEach(() => {
    appointmentRepo = {
      findByIdScopedEnriched: jest.fn().mockResolvedValue(makeAppointment()),
      changeService: jest.fn().mockResolvedValue({
        appointmentsUpdated: 4,
        pendingConsultationsUpdated: true,
        paymentAdjusted: true,
      }),
    };
    planRepo = {
      findById: jest.fn(),
      findAllByDoctorId: jest.fn().mockResolvedValue([]),
    };
    useCase = new ChangeAppointmentServiceUseCase(
      appointmentRepo as unknown as IAppointmentRepository,
      planRepo as unknown as IPricingPlanRepository,
    );
  });

  const input = {
    appointmentId: APPT_ID,
    doctorId: DOCTOR_ID,
    actorId: DOCTOR_ID,
    newPlanId: NEW_PLAN_ID,
  };

  it('cambia el servicio cuando el nuevo tiene el mismo número de consultas', async () => {
    // El actual: paquete de 4 ($120). El nuevo: otro paquete de 4 ($160).
    planRepo.findById.mockImplementation(async (id: string) =>
      id === NEW_PLAN_ID
        ? makePlan()
        : makePlan({ id: OLD_PLAN_ID, name: 'Paquete 4 consultas', priceUsd: 120 }),
    );

    const result = await useCase.execute(input);

    expect(appointmentRepo.changeService).toHaveBeenCalledWith({
      appointmentId: APPT_ID,
      doctorId: DOCTOR_ID,
      actorId: DOCTOR_ID,
      newPlanId: NEW_PLAN_ID,
      newPlanName: 'Paquete 4 sesiones de fisio',
      newPlanPriceUsd: 160,
      // El asiento de auditoría necesita de qué se venía, no solo a dónde se va.
      oldPlanName: 'Paquete 4 consultas',
      oldPlanPriceUsd: 120,
    });
    expect(result.unchanged).toBe(false);
    expect(result.appointmentsUpdated).toBe(4);
    expect(result.planPriceUsd).toBe(160);
  });

  it('rechaza un servicio con distinto número de consultas y NO escribe nada', async () => {
    planRepo.findById.mockImplementation(async (id: string) =>
      id === NEW_PLAN_ID
        ? makePlan({ sessionsCount: 1, name: 'Consulta simple', priceUsd: 40 })
        : makePlan({ id: OLD_PLAN_ID, sessionsCount: 4 }),
    );

    await expect(useCase.execute(input)).rejects.toThrow(ServiceChangeNotEquivalentError);
    expect(appointmentRepo.changeService).not.toHaveBeenCalled();
  });

  it('rechaza un servicio de otro especialista', async () => {
    planRepo.findById.mockResolvedValue(makePlan({ doctorId: 'otro-doctor' }));

    await expect(useCase.execute(input)).rejects.toThrow(ServiceNotAvailableError);
    expect(appointmentRepo.changeService).not.toHaveBeenCalled();
  });

  it('rechaza un servicio desactivado del catálogo', async () => {
    planRepo.findById.mockResolvedValue(makePlan({ isActive: false }));

    await expect(useCase.execute(input)).rejects.toThrow(ServiceNotAvailableError);
    expect(appointmentRepo.changeService).not.toHaveBeenCalled();
  });

  it('rechaza cuando la cita no existe o es de otro especialista', async () => {
    appointmentRepo.findByIdScopedEnriched.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(AppointmentNotFoundError);
    // Ni siquiera se consulta el catálogo: sin cita no hay nada que corregir.
    expect(planRepo.findById).not.toHaveBeenCalled();
  });

  it('no hace nada cuando la cita ya tiene ese servicio', async () => {
    appointmentRepo.findByIdScopedEnriched.mockResolvedValue(
      makeAppointment({ planId: NEW_PLAN_ID }),
    );
    planRepo.findById.mockResolvedValue(makePlan());

    const result = await useCase.execute(input);

    expect(result.unchanged).toBe(true);
    expect(appointmentRepo.changeService).not.toHaveBeenCalled();
  });

  it('resuelve el servicio actual POR NOMBRE cuando la cita no tiene plan_id', async () => {
    // Citas viejas: la migración solo rellenó plan_id donde el nombre era inequívoco.
    appointmentRepo.findByIdScopedEnriched.mockResolvedValue(makeAppointment({ planId: null }));
    planRepo.findById.mockResolvedValue(makePlan());
    planRepo.findAllByDoctorId.mockResolvedValue([
      makePlan({ id: OLD_PLAN_ID, name: 'Paquete 4 consultas', sessionsCount: 4 }),
    ]);

    await useCase.execute(input);

    expect(appointmentRepo.changeService).toHaveBeenCalled();
  });

  it('con dos servicios homónimos NO adivina: trata la cita como de una sola consulta', async () => {
    // Adivinar entre homónimos es justo el error que plan_id vino a eliminar.
    // Sin plan resoluble se asume 1 sesión, así que cambiar a un paquete de 4 se rechaza.
    appointmentRepo.findByIdScopedEnriched.mockResolvedValue(makeAppointment({ planId: null }));
    planRepo.findById.mockResolvedValue(makePlan({ sessionsCount: 4 }));
    planRepo.findAllByDoctorId.mockResolvedValue([
      makePlan({ id: 'homonimo-1', name: 'Paquete 4 consultas', sessionsCount: 4 }),
      makePlan({ id: 'homonimo-2', name: 'Paquete 4 consultas', sessionsCount: 2 }),
    ]);

    await expect(useCase.execute(input)).rejects.toThrow(ServiceChangeNotEquivalentError);
    expect(appointmentRepo.changeService).not.toHaveBeenCalled();
  });

  it('propaga AppointmentNotFoundError si la cita desaparece durante la escritura', async () => {
    planRepo.findById.mockResolvedValue(makePlan());
    planRepo.findAllByDoctorId.mockResolvedValue([
      makePlan({ id: OLD_PLAN_ID, name: 'Paquete 4 consultas', sessionsCount: 4 }),
    ]);
    appointmentRepo.findByIdScopedEnriched.mockResolvedValue(makeAppointment({ planId: null }));
    appointmentRepo.changeService.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(AppointmentNotFoundError);
  });
});
