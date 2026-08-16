import { Inject, Injectable } from '@nestjs/common';
import {
  PENDING_CONSULTATION_REPOSITORY,
  type IPendingConsultationRepository,
  type PackageUsageRow,
} from '../../domain/repositories/pending-consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { PatientNotOwnedError } from '../../domain/errors/patient-not-owned.error';

export interface GetPackageUsageInput {
  doctorId: string;
  /**
   * Opcional. Ausente = todos los pacientes del doctor, en una sola consulta
   * agrupada (la lista de pacientes pinta una insignia por fila y trae hasta
   * 100 por página: de a uno sería un N+1).
   */
  patientId?: string;
}

/**
 * GetPackageUsageUseCase
 *
 * Returns per-plan session consumption for a patient.
 *
 * Anti-IDOR: doctorId is always taken from the authenticated session (never from
 * the request body/query). The patient must belong to the authenticated doctor.
 *
 * Sesión consumida = ATENDIDA (appointment.status = 'completed').
 * Una inasistencia (no_show) no consume sesión y aparece en su propio balde.
 *
 * NEVER log patientId or plan names (PII).
 */
@Injectable()
export class GetPackageUsageUseCase {
  constructor(
    @Inject(PENDING_CONSULTATION_REPOSITORY)
    private readonly pendingRepo: IPendingConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: GetPackageUsageInput): Promise<PackageUsageRow[]> {
    // Anti-IDOR: si se pide un paciente puntual, tiene que ser del doctor.
    // Sin paciente, el filtro por doctorId de la consulta ya acota el universo
    // a lo suyo — no hay nada que un doctor pueda ver de otro.
    if (input.patientId !== undefined) {
      const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
      if (!patient) {
        throw new PatientNotOwnedError(input.patientId);
      }
    }

    return this.pendingRepo.getPackageUsage(input.doctorId, input.patientId);
  }
}
