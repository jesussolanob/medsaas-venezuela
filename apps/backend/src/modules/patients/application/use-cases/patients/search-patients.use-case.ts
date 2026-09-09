import { Inject, Injectable } from '@nestjs/common';
import { normalizeForSearch, cedulaSearchVariants } from '@delta/shared-crypto';
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

  /**
   * Búsqueda por cédula. Prueba el texto TAL CUAL se tipeó y la forma CANÓNICA.
   *
   * ⚠️ Acá había una regresión: se hacía `hashForSearch(q)` a secas, que
   * normaliza solo espacios, acentos y mayúsculas. Pero la huella GUARDADA se
   * calcula sobre la forma canónica (`normalizeCedulaForSearch`, que además saca
   * guiones y puntos). Buscar "V-26541987" hasheaba "v-26541987" y en la base
   * estaba "v26541987": no coincidían NUNCA. Toda búsqueda por cédula devolvía
   * cero resultados, con el buscador prometiendo en su placeholder que servía.
   *
   * Cuando se cambió cómo se guarda la huella se actualizaron los tres puntos de
   * alta (crear paciente, booking público, destinatario de presupuesto) y ESTE
   * quedó afuera. Es el mismo `cedulaSearchVariants` que usan los otros tres.
   */
  private async searchByCedulaHash(
    q: string,
    input: SearchPatientsInput,
  ): Promise<SearchPatientsResult> {
    for (const variante of cedulaSearchVariants(q)) {
      const patient = await this.patientRepo.findByCedulaHash(
        this.crypto.hashForSearch(variante),
        input.doctorId,
      );
      if (patient) {
        return { items: [patient], total: 1, page: input.page, limit: input.limit };
      }
    }
    return { items: [], total: 0, page: input.page, limit: input.limit };
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

  /**
   * Búsqueda por NOMBRE, TELÉFONO o CÉDULA sobre los pacientes ya descifrados.
   *
   * El teléfono y la cédula se buscan acá y no por huella porque el teléfono no
   * tiene huella de búsqueda, y porque una cédula tecleada sin prefijo
   * ("26541987") no puede resolverse por huella sin adivinar la nacionalidad.
   * Este camino ya descifra toda la lista del especialista para el nombre, así
   * que compararlos también sale gratis.
   *
   * El buscador PROMETE en su placeholder "nombre, teléfono o cédula" y solo
   * andaba por nombre: teclear un teléfono o una cédula devolvía cero resultados
   * sin explicación. Una etiqueta que afirma lo que el sistema no hace es peor
   * que no tenerla.
   */
  private async searchByNameSubstring(
    q: string,
    input: SearchPatientsInput,
  ): Promise<SearchPatientsResult> {
    const all = await this.patientRepo.findAllByDoctor(input.doctorId);
    // Misma normalización que el hash de búsqueda (trim, espacios colapsados, sin
    // acentos, minúsculas): así "maria jose" encuentra a "María  José" y el nombre
    // guardado con espacios de sobra no queda invisible.
    const needle = normalizeForSearch(q);
    // Para teléfono y cédula se comparan solo los DÍGITOS, así "0414-123 45 67",
    // "+58 414 1234567" y "4141234567" se encuentran entre sí. Se exige un mínimo
    // de 4 dígitos para que teclear "1" no devuelva media agenda.
    const soloDigitos = q.replace(/\D/g, '');
    const buscaPorNumero = soloDigitos.length >= 4;

    const matched = all.filter((p) => {
      if (normalizeForSearch(p.fullName).includes(needle)) return true;
      if (!buscaPorNumero) return false;
      const telefono = (p.phone ?? '').replace(/\D/g, '');
      const cedula = (p.cedula ?? '').replace(/\D/g, '');
      return (
        (telefono.length > 0 && telefono.includes(soloDigitos)) ||
        (cedula.length > 0 && cedula.includes(soloDigitos))
      );
    });

    const total = matched.length;
    const offset = (input.page - 1) * input.limit;
    const items = matched.slice(offset, offset + input.limit);

    return { items, total, page: input.page, limit: input.limit };
  }
}
