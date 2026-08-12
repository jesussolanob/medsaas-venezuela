import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../domain/repositories/doctor-profile.repository';

/** Plan gratuito permanente al que cae una cuenta cuando vence su plan pago. */
const FREE_PLAN_KEY = 'delta_free';

/**
 * ApplyScheduledDeactivationsUseCase — barrido diario de bajas programadas.
 *
 * Cuando un especialista se da de baja con días ya pagados, la cuenta NO se
 * apaga en el momento: conserva su plan hasta el vencimiento
 * (`scheduleOwnAccountDeactivation`). Este barrido es el que llega ese día y
 * cierra el círculo: pasa el perfil al plan gratuito y lo apaga.
 *
 * Por qué un barrido y no solo evaluarlo al iniciar sesión: el efecto de apagar
 * la cuenta se tiene que ver AUNQUE el especialista no vuelva a entrar — con la
 * cuenta encendida su página pública de reservas sigue tomando citas.
 *
 * Es idempotente: el UPDATE filtra por `is_active = true`, así que una segunda
 * corrida el mismo día no toca nada. Y si el especialista vuelve a entrar
 * después, el login lo reactiva en el plan gratuito (ProcessLoginTouchUseCase),
 * que es exactamente el estado final que se busca.
 */
@Injectable()
export class ApplyScheduledDeactivationsUseCase {
  private readonly logger = new Logger(ApplyScheduledDeactivationsUseCase.name);

  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
  ) {}

  /** Devuelve cuántas cuentas se apagaron en esta corrida. */
  async execute(): Promise<number> {
    const apagadas = await this.profileRepo.applyExpiredScheduledDeactivations(FREE_PLAN_KEY);
    if (apagadas > 0) {
      // Solo el conteo — nunca ids ni datos del especialista en el log del cron.
      this.logger.log(`[bajas] ${apagadas} cuenta(s) con baja programada pasaron a plan gratuito`);
    }
    return apagadas;
  }
}
