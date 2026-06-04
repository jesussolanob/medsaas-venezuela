import { Inject, Injectable } from '@nestjs/common';
import {
  IConsultationRepository,
  CONSULTATION_REPOSITORY,
} from '../../../domain/repositories/consultation.repository';
import {
  type IPatientRepository,
  PATIENT_REPOSITORY,
} from '../../../../patients/domain/repositories/patient.repository';

export interface ConsultationWithPatientItem {
  id: string;
  consultation_code: string;
  consultation_date: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
}

export interface ListConsultationsWithPatientInput {
  doctorId: string;
  limit: number;
}

/**
 * Billing-oriented read: the doctor's consultations enriched with the patient's
 * decrypted name/phone/email so the doctor can issue receipts/estimates.
 *
 * SECURITY:
 *   - Anti-IDOR double scope: consultations AND patients are both filtered by the
 *     authenticated doctorId (the consultation repo scopes by doctorId in its list;
 *     patients come from findAllByDoctor(doctorId)). A doctor can only ever see
 *     their own patients' data.
 *   - PII (name/phone/email) is returned in plaintext deliberately: the doctor is
 *     the owner/author and needs it to print a billing document. This endpoint is
 *     NOT exposed to admin or third parties. Do not reuse the default list mapper.
 *   - Patients are looked up once (findAllByDoctor) and joined in-memory by id to
 *     avoid an N+1 query per consultation.
 */
@Injectable()
export class ListConsultationsWithPatientUseCase {
  constructor(
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultations: IConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patients: IPatientRepository,
  ) {}

  async execute(input: ListConsultationsWithPatientInput): Promise<ConsultationWithPatientItem[]> {
    const [list, patients] = await Promise.all([
      this.consultations.list({
        doctorId: input.doctorId,
        page: 1,
        limit: input.limit,
      }),
      this.patients.findAllByDoctor(input.doctorId),
    ]);

    const patientById = new Map(patients.map((p) => [p.id, p]));

    return list.items.map((c) => {
      const patient = patientById.get(c.patientId);
      return {
        id: c.id,
        consultation_code: c.consultationCode,
        consultation_date: c.consultationDate.toISOString(),
        patient_id: c.patientId,
        patient_name: patient?.fullName ?? 'Paciente',
        patient_phone: patient?.phone ?? null,
        patient_email: patient?.email ?? null,
      };
    });
  }
}
