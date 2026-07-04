import { Inject, Injectable } from '@nestjs/common';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import {
  PATIENT_REQUEST_ATTACHMENT_REPOSITORY,
  type IPatientRequestAttachmentRepository,
} from '../../domain/repositories/patient-request-attachment.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';

export interface PatientRequestListItem {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  attachmentCount: number;
  createdAt: string;
  fulfilledAt: string | null;
}

export interface ListPatientRequestsInput {
  doctorId: string;
}

export interface ListPatientRequestsOutput {
  items: PatientRequestListItem[];
}

/**
 * ListPatientRequestsUseCase — returns all requests created by the doctor.
 *
 * OPTIMISATION (N+1 elimination):
 *   All data is loaded in exactly 3 queries regardless of result count:
 *     1. `requestRepo.listByDoctor(doctorId)` — all requests for this doctor.
 *     2. `patientRepo.findAllByDoctor(doctorId)` — all patients (for name lookup).
 *     3. `attachmentRepo.countByRequestIds(ids)` — batch count via GROUP BY.
 *   Results are assembled in memory using Maps; no per-item DB calls.
 */
@Injectable()
export class ListPatientRequestsUseCase {
  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    @Inject(PATIENT_REQUEST_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IPatientRequestAttachmentRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: ListPatientRequestsInput): Promise<ListPatientRequestsOutput> {
    const requests = await this.requestRepo.listByDoctor(input.doctorId);

    if (requests.length === 0) {
      return { items: [] };
    }

    const requestIds = requests.map((r) => r.id);

    // Batch-fetch patients and attachment counts in parallel (2 queries total)
    const [patients, countMap] = await Promise.all([
      this.patientRepo.findAllByDoctor(input.doctorId),
      this.attachmentRepo.countByRequestIds(requestIds),
    ]);

    // Build O(1) lookup map for patients by ID
    const patientMap = new Map(patients.map((p) => [p.id, p]));

    const items: PatientRequestListItem[] = requests.map((req) => ({
      id: req.id,
      patientId: req.patientId,
      patientName: patientMap.get(req.patientId)?.fullName ?? 'Paciente',
      title: req.title,
      description: req.description,
      status: req.status,
      attachmentCount: countMap[req.id] ?? 0,
      createdAt: req.createdAt.toISOString(),
      fulfilledAt: req.fulfilledAt?.toISOString() ?? null,
    }));

    return { items };
  }
}
