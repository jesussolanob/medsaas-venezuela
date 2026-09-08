import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { cedulaSearchVariants } from '@delta/shared-crypto';
import { Patient, type PatientSource } from '../../../domain/entities/patient.entity';
import { DuplicatePatientError } from '../../../domain/errors/duplicate-patient.error';
import { PatientEmailIsDoctorError } from '../../../domain/errors/patient-email-is-doctor.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';
import { ResolvePatientIdentityUseCase } from '../../../../patient-identities/application/use-cases/resolve-patient-identity.use-case';

export interface CreatePatientInput {
  doctorId: string;
  fullName: string;
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
  emergencyContactRelationship?: string | null;
  notes?: string | null;
  authUserId?: string | null;
}

@Injectable()
export class CreatePatientUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly crypto: CryptoService,
    private readonly resolveIdentity: ResolvePatientIdentityUseCase,
  ) {}

  async execute(input: CreatePatientInput): Promise<Patient> {
    // Guard: prevent duplicate cédula per doctor.
    //
    // Checks two hashes, not one. Writes now hash the CANONICAL form of the
    // cédula (see SequelizePatientRepository), but patients created before
    // this change still carry the OLD hash — computed straight from whatever
    // was typed, separators and all — until a separate rehash script runs.
    // Checking only the canonical hash would go blind to every pre-existing
    // patient and create a duplicate for each one; checking only the raw hash
    // would miss "V-12345678" matching a patient stored as "V12345678".
    if (input.cedula) {
      for (const variant of cedulaSearchVariants(input.cedula)) {
        const cedulaHash = this.crypto.hashForSearch(variant);
        const existing = await this.patientRepo.findByCedulaHash(cedulaHash, input.doctorId);
        if (existing) {
          throw new DuplicatePatientError('cedula', input.cedula);
        }
      }
    }

    // Guard: prevent using the doctor's own email for a patient
    if (input.email) {
      const normalizedPatientEmail = input.email.trim().toLowerCase();
      const doctorProfile = await this.doctorProfileRepo.findByDoctorId(input.doctorId);
      if (doctorProfile) {
        const normalizedDoctorEmail = doctorProfile.email.trim().toLowerCase();
        if (normalizedPatientEmail === normalizedDoctorEmail) {
          throw new PatientEmailIsDoctorError();
        }
      }
    }

    // Resolve global identity (transparent — only sets identity_id internally)
    const identityId = await this.resolveIdentity.execute(input.cedula);

    const now = new Date();
    const patient = Patient.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      authUserId: input.authUserId ?? null,
      fullName: input.fullName,
      cedula: input.cedula ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      identityId,
      source: input.source ?? null,
      birthDate: input.birthDate ?? null,
      age: input.age ?? null,
      sex: input.sex ?? null,
      bloodType: input.bloodType ?? null,
      allergies: input.allergies ?? null,
      chronicConditions: input.chronicConditions ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      emergencyContactRelationship: input.emergencyContactRelationship ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.patientRepo.save(patient);
  }
}
