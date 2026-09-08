import { Inject, Injectable } from '@nestjs/common';
import type { QuoteNewRecipient } from '@delta/shared-types';
import { cedulaSearchVariants, normalizeCedulaForSearch } from '@delta/shared-crypto';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { CreatePatientUseCase } from '../../../patients/application/use-cases/patients/create-patient.use-case';
import { CryptoService } from '../../../../infrastructure/crypto/crypto.service';

/**
 * ResolveQuoteRecipientPatientUseCase — internal-only, not exposed via HTTP.
 *
 * Resolves the `new_recipient` payload of CreateQuoteDto (name, cédula, phone,
 * email of someone who is not yet a patient) into a patient_id.
 *
 * Business rule — never duplicate a patient:
 *   A specialist quoting someone who is ALREADY their patient (they just
 *   didn't pick them from the list) must land on the SAME patient record.
 *   The cédula is the identity key: if a patient with that cédula already
 *   exists for this doctor, it is REUSED as-is (nothing is created or
 *   modified, even if the name/phone/email typed here differ slightly).
 *   Otherwise a brand new patient is created.
 *
 * Encryption: delegates patient creation to CreatePatientUseCase — the only
 * place that knows how to encrypt PII for a patient record. This use case
 * never touches AES/HMAC directly except for the search hash needed to look
 * the cédula up (same as CreatePatientUseCase's own duplicate guard).
 *
 * PII: never logs cedula/fullName/phone/email — only IDs.
 */
@Injectable()
export class ResolveQuoteRecipientPatientUseCase {
  constructor(
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly crypto: CryptoService,
    private readonly createPatient: CreatePatientUseCase,
  ) {}

  /**
   * Formas en que la MISMA cédula pudo haberse guardado.
   *
   * Las primeras dos variantes vienen de `cedulaSearchVariants` (@delta/shared-crypto,
   * compartida con el guard de duplicados de CreatePatientUseCase y con el booking
   * público): el texto TAL CUAL se tipeó — porque los pacientes guardados antes de
   * este cambio siguen con el hash VIEJO hasta que corra el rehasheo, y sin esa
   * variante dejarían de encontrarse TODOS — y la forma CANÓNICA que usa la
   * escritura desde ahora (SequelizePatientRepository, CreatePatientUseCase).
   *
   * La tercera variante (sin prefijo) es una heurística deliberada SOLO para este
   * flujo, no forma parte del helper compartido: cubre los pacientes guardados
   * como solo dígitos antes de que el alta de presupuestos exigiera `V/E/P-<valor>`
   * (el alta normal de pacientes acepta la cédula como texto libre, sin formato).
   * NO se usa al escribir — nunca se inventa ni se quita el prefijo al guardar
   * (V y E son personas distintas).
   *
   * Resultado sin esto: un paciente guardado como "12345678" no se encuentra al
   * buscar "V-12345678", y se le crea un SEGUNDO registro con la historia clínica
   * partida en dos, sin ningún error visible.
   *
   * Medido en producción (2026-09-08): de 64 pacientes con cédula, 61 ya están en
   * el formato canónico y 2 son solo dígitos. Por eso se prueban variantes al BUSCAR
   * en vez de rehashear a todos los pacientes: cubre los casos reales sin reescribir
   * un solo dato guardado.
   *
   * Devuelve las variantes sin repetir y en orden de probabilidad.
   */
  private cedulaLookupVariants(cedula: string): string[] {
    const canonica = normalizeCedulaForSearch(cedula);
    const sinPrefijo = canonica.replace(/^[VEP]/, ''); // "V12345678" → "12345678"

    return [...new Set([...cedulaSearchVariants(cedula), sinPrefijo].filter((v) => v.length > 0))];
  }

  async execute(doctorId: string, recipient: QuoteNewRecipient): Promise<string> {
    // Se consulta variante por variante y se corta en la primera que exista. Son
    // como mucho tres lecturas en el alta de un presupuesto — no es un camino
    // caliente, y evita agregar un método al puerto (lo que obligaría a tocar
    // TODOS los mocks del módulo de pacientes).
    for (const variante of this.cedulaLookupVariants(recipient.cedula)) {
      const existing = await this.patientRepo.findByCedulaHash(
        this.crypto.hashForSearch(variante),
        doctorId,
      );
      if (existing) {
        return existing.id;
      }
    }

    const fullName = `${recipient.first_name} ${recipient.last_name}`.trim();
    const created = await this.createPatient.execute({
      doctorId,
      fullName,
      cedula: recipient.cedula,
      phone: recipient.phone,
      email: recipient.email ?? null,
      source: 'manual',
    });
    return created.id;
  }
}
