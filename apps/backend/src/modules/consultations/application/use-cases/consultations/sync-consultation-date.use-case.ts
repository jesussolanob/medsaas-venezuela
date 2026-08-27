import { Inject, Injectable } from '@nestjs/common';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../domain/repositories/consultation.repository';

export interface SyncConsultationDateInput {
  /** Cita que se acaba de mover. */
  appointmentId: string;
  /** Doctor autenticado — acota la búsqueda y el update (anti-IDOR). */
  doctorId: string;
  /** Nueva fecha/hora de la cita. */
  newScheduledAt: Date;
}

/**
 * SyncConsultationDateUseCase
 *
 * Mueve `consultations.consultation_date` cuando su cita se reagenda.
 *
 * Una consulta y su cita son el MISMO encuentro. Antes la reagenda solo tocaba
 * `appointments.scheduled_at`, así que el módulo de Consultas seguía mostrando
 * la hora vieja. No era solo cosmético: esa columna es la que usan el filtro por
 * rango de fechas y el orden del listado, de modo que una reagenda que cruzara
 * de día (o de mes) dejaba la consulta archivada en la fecha equivocada.
 *
 * Es idempotente y tolerante: si la cita no tiene consulta asociada no hace
 * nada. El llamador la trata como best-effort — que falle esto NO puede tumbar
 * una reagenda que ya se persistió.
 */
@Injectable()
export class SyncConsultationDateUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
  ) {}

  async execute(input: SyncConsultationDateInput): Promise<void> {
    const consultation = await this.consultationRepo.findByAppointmentId(
      input.appointmentId,
      input.doctorId,
    );
    if (!consultation) return;

    await this.consultationRepo.update(consultation.id, input.doctorId, {
      consultationDate: input.newScheduledAt,
    });
  }
}
