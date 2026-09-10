import { Inject, Injectable } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY,
  type IAppointmentRepository,
  type ChangeServiceResult,
} from '../../../domain/repositories/appointment.repository';
import {
  PRICING_PLAN_REPOSITORY,
  type IPricingPlanRepository,
} from '../../../../packages/domain/repositories/pricing-plan.repository';
import type { PricingPlan } from '../../../../packages/domain/entities/pricing-plan.entity';
import { AppointmentNotFoundError } from '../../../domain/errors/appointment-not-found.error';
import { ServiceChangeNotEquivalentError } from '../../../domain/errors/service-change-not-equivalent.error';
import { ServiceNotAvailableError } from '../../../domain/errors/service-not-available.error';

export interface ChangeAppointmentServiceInput {
  appointmentId: string;
  /** Dueño de la cita. */
  doctorId: string;
  /** Quién dispara el cambio — puede no ser el dueño (admin de clínica). */
  actorId: string;
  newPlanId: string;
}

export interface ChangeAppointmentServiceOutput extends ChangeServiceResult {
  planName: string;
  planPriceUsd: number;
  /** true cuando la cita ya tenía ese servicio y no hubo nada que corregir. */
  unchanged: boolean;
}

/**
 * Corrige el servicio contratado en una cita.
 *
 * El paciente se equivoca al elegir el paquete en la reserva pública y hasta hoy
 * no había forma de arreglarlo: quedaba cobrado el servicio que no era y la única
 * salida era rehacer la cita entera.
 *
 * Reglas (decididas 2026-09-10):
 *  - Solo entre servicios EQUIVALENTES — mismo `sessionsCount`. Así no hay que
 *    crear ni borrar preconsultas, ni decidir qué pasa con lo ya agendado.
 *  - Se permite aunque la consulta ya esté atendida: el error casi siempre se
 *    descubre después, y bloquearlo dejaba sin salida al caso más común.
 *  - El pago se ajusta de monto y SIGUE aprobado; la diferencia queda asentada
 *    en `appointment_changes_log` con monto anterior, monto nuevo y autor.
 *
 * El arrastre al resto del paquete y la atomicidad viven en el repositorio
 * (`changeService`): son cinco tablas que tienen que moverse juntas o ninguna.
 */
@Injectable()
export class ChangeAppointmentServiceUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: IAppointmentRepository,
    @Inject(PRICING_PLAN_REPOSITORY)
    private readonly pricingPlanRepo: IPricingPlanRepository,
  ) {}

  async execute(input: ChangeAppointmentServiceInput): Promise<ChangeAppointmentServiceOutput> {
    const appointment = await this.appointmentRepo.findByIdScopedEnriched(
      input.appointmentId,
      input.doctorId,
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    const newPlan = await this.pricingPlanRepo.findById(input.newPlanId);
    // Mismo error para "no existe", "es de otro doctor" y "está desactivado":
    // distinguirlos le confirma a quien prueba IDs ajenos cuáles existen.
    if (!newPlan || newPlan.doctorId !== input.doctorId || !newPlan.isActive) {
      throw new ServiceNotAvailableError();
    }

    if (appointment.planId === newPlan.id) {
      // Idempotente: elegir el mismo servicio no es un error, no hace nada.
      return {
        appointmentsUpdated: 0,
        pendingConsultationsUpdated: false,
        paymentAdjusted: false,
        planName: newPlan.name,
        planPriceUsd: newPlan.priceUsd,
        unchanged: true,
      };
    }

    const currentSessions = await this.resolveCurrentSessions(
      input.doctorId,
      appointment.planId,
      appointment.planName,
    );
    if (currentSessions !== newPlan.sessionsCount) {
      throw new ServiceChangeNotEquivalentError(currentSessions, newPlan.sessionsCount);
    }

    const result = await this.appointmentRepo.changeService({
      appointmentId: input.appointmentId,
      doctorId: input.doctorId,
      actorId: input.actorId,
      newPlanId: newPlan.id,
      newPlanName: newPlan.name,
      newPlanPriceUsd: newPlan.priceUsd,
      oldPlanName: appointment.planName,
      oldPlanPriceUsd: appointment.planPrice,
    });
    // null = la cita se borró entre la lectura y la escritura. Es la misma
    // respuesta que si nunca hubiera existido.
    if (!result) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    return {
      ...result,
      planName: newPlan.name,
      planPriceUsd: newPlan.priceUsd,
      unchanged: false,
    };
  }

  /**
   * Cuántas sesiones tiene HOY el servicio de la cita.
   *
   * Preferimos `plan_id` (identidad). Las citas viejas pueden no tenerlo —la
   * migración solo rellenó los nombres inequívocos— así que se cae a buscar por
   * nombre, y **solo se acepta si hay exactamente uno**: con dos servicios
   * homónimos, adivinar es justo el error que `plan_id` vino a eliminar.
   *
   * Sin plan resoluble se asume 1 sesión, que es lo que es una consulta suelta.
   */
  private async resolveCurrentSessions(
    doctorId: string,
    planId: string | null,
    planName: string | null,
  ): Promise<number> {
    let plan: PricingPlan | null = null;

    if (planId) {
      plan = await this.pricingPlanRepo.findById(planId);
      if (plan && plan.doctorId !== doctorId) plan = null;
    }

    if (!plan && planName) {
      const plans = await this.pricingPlanRepo.findAllByDoctorId(doctorId);
      const byName = plans.filter((p) => p.name === planName);
      if (byName.length === 1) plan = byName[0]!;
    }

    return plan?.sessionsCount ?? 1;
  }
}
