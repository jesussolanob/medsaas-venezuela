import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Patient, type PatientSource } from '../../../domain/entities/patient.entity';
import { PatientAlreadyExistsError } from '../../../domain/errors/patient-already-exists.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';
import { CryptoService } from '../../../infrastructure/crypto/crypto.service';

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
  notes?: string | null;
  authUserId?: string | null;
}

@Injectable()
export class CreatePatientUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly crypto: CryptoService,
  ) {}

  async execute(input: CreatePatientInput): Promise<Patient> {
    // Guard: prevent duplicate cédula per doctor
    if (input.cedula) {
      const cedulaHash = this.crypto.hashForSearch(input.cedula);
      const existing = await this.patientRepo.findByCedulaHash(cedulaHash, input.doctorId);
      if (existing) {
        throw new PatientAlreadyExistsError(input.cedula);
      }
    }

    const now = new Date();
    const patient = Patient.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      authUserId: input.authUserId ?? null,
      fullName: input.fullName,
      cedula: input.cedula ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
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
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.patientRepo.save(patient);
  }
}
