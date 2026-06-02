import { Inject, Injectable } from '@nestjs/common';
import { Patient, type PatientSource } from '../../../domain/entities/patient.entity';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import { UnauthorizedError } from '../../../../../domain/errors/domain.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';

export interface UpdatePatientInput {
  patientId: string;
  doctorId: string;
  fullName?: string;
  cedula?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: PatientSource | null;
  birthDate?: string | null;
  age?: number | null;
  sex?: 'male' | 'female' | 'other' | null;
  bloodType?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  address?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
}

@Injectable()
export class UpdatePatientUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(input: UpdatePatientInput): Promise<Patient> {
    // findById is scoped to doctorId — foreign patients appear as not-found.
    const patient = await this.patientRepo.findById(input.patientId, input.doctorId);
    if (!patient) {
      throw new PatientNotFoundError();
    }
    if (!patient.canBeAccessedBy(input.doctorId)) {
      throw new UnauthorizedError();
    }

    // Build an update payload that only includes fields explicitly provided by the caller.
    // Entries are undefined-guarded so the repo's `hasOwnProperty` loop only touches
    // keys that were actually sent — a missing key means "don't touch this field".
    //
    // Patient properties are readonly, so spread-conditional construction avoids
    // mutation while preserving compile-time key validation.
    return this.patientRepo.update(input.patientId, input.doctorId, {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.cedula !== undefined && { cedula: input.cedula }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.source !== undefined && { source: input.source }),
      ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
      ...(input.age !== undefined && { age: input.age }),
      ...(input.sex !== undefined && { sex: input.sex }),
      ...(input.bloodType !== undefined && { bloodType: input.bloodType }),
      ...(input.allergies !== undefined && { allergies: input.allergies }),
      ...(input.chronicConditions !== undefined && { chronicConditions: input.chronicConditions }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.emergencyContactName !== undefined && {
        emergencyContactName: input.emergencyContactName,
      }),
      ...(input.emergencyContactPhone !== undefined && {
        emergencyContactPhone: input.emergencyContactPhone,
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
    });
  }
}
