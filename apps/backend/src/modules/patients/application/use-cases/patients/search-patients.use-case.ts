import { Inject, Injectable } from '@nestjs/common';
import { Patient } from '../../../domain/entities/patient.entity';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../domain/repositories/patient.repository';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

export interface SearchPatientsInput {
  query: string;
  doctorId: string;
  page: number;
  limit: number;
}

export interface SearchPatientsResult {
  items: Patient[];
  total: number;
  page: number;
  limit: number;
}

/** Returns true when the query looks like a Venezuelan cédula (V-... or E-...). */
function looksLikeCedula(q: string): boolean {
  return /^[VvEe]-?\d+/.test(q.trim());
}

/** Returns true when the query looks like an email address. */
function looksLikeEmail(q: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

@Injectable()
export class SearchPatientsUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly crypto: CryptoService,
  ) {}

  async execute(input: SearchPatientsInput): Promise<SearchPatientsResult> {
    const q = input.query.trim();

    if (looksLikeCedula(q)) {
      return this.searchByCedulaHash(q, input);
    }

    if (looksLikeEmail(q)) {
      return this.searchByEmailHash(q, input);
    }

    // Partial name search: fetch all patients for the doctor, decrypt, filter in-app
    return this.searchByNameSubstring(q, input);
  }

  private async searchByCedulaHash(
    q: string,
    input: SearchPatientsInput,
  ): Promise<SearchPatientsResult> {
    const hash = this.crypto.hashForSearch(q);
    const patient = await this.patientRepo.findByCedulaHash(hash, input.doctorId);
    const items = patient ? [patient] : [];
    return { items, total: items.length, page: input.page, limit: input.limit };
  }

  private async searchByEmailHash(
    q: string,
    input: SearchPatientsInput,
  ): Promise<SearchPatientsResult> {
    const hash = this.crypto.hashForSearch(q);
    const patient = await this.patientRepo.findByEmailHash(hash, input.doctorId);
    const items = patient ? [patient] : [];
    return { items, total: items.length, page: input.page, limit: input.limit };
  }

  private async searchByNameSubstring(
    q: string,
    input: SearchPatientsInput,
  ): Promise<SearchPatientsResult> {
    const all = await this.patientRepo.findAllByDoctor(input.doctorId);
    const lower = q.toLowerCase();

    const matched = all.filter((p) => p.fullName.toLowerCase().includes(lower));

    const total = matched.length;
    const offset = (input.page - 1) * input.limit;
    const items = matched.slice(offset, offset + input.limit);

    return { items, total, page: input.page, limit: input.limit };
  }
}
