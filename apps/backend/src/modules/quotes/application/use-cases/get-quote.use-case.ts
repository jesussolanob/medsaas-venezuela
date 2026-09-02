import { Inject, Injectable } from '@nestjs/common';
import {
  QUOTE_REPOSITORY,
  type IQuoteRepository,
} from '../../domain/repositories/iquote.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import {
  LEAD_REPOSITORY,
  type ILeadRepository,
} from '../../../leads/domain/repositories/lead.repository';
import type { Quote } from '../../domain/entities/quote.entity';
import { QuoteNotFoundError } from '../../domain/errors/quote-not-found.error';

/** La cotización más el nombre de a quién va dirigida. */
export interface QuoteWithRecipient {
  quote: Quote;
  /**
   * Nombre del destinatario, ya resuelto. null solo si el paciente o el lead
   * fueron borrados después de emitir la cotización.
   *
   * SECURITY: es PII (nombre de paciente). Se expone al especialista dueño de la
   * cotización, que ya lo ve en su propia ficha. NUNCA se loguea.
   */
  recipientName: string | null;
}

/**
 * Returns a single quote scoped to the authenticated doctor, con el nombre del
 * destinatario resuelto.
 *
 * Anti-IDOR: a foreign quote and a missing ID produce the same 404 error.
 * The repository scopes by (id, doctorId) and returns null for both cases.
 *
 * Por qué el nombre se resuelve acá y no viaja en la entidad: `quotes` guarda
 * solo `patient_id` / `lead_id`, y el nombre del paciente está cifrado
 * (AES-256-GCM), así que solo el repositorio de pacientes sabe descifrarlo. La
 * pantalla y el PDF mostraban la categoría ("Paciente" / "Prospecto") en vez de
 * a quién, que en un documento que recibe el destinatario no sirve de nada.
 *
 * Las dos búsquedas van scoped por doctorId: un id de otro especialista devuelve
 * null y el nombre queda vacío, nunca filtra datos ajenos.
 */
@Injectable()
export class GetQuoteUseCase {
  constructor(
    @Inject(QUOTE_REPOSITORY)
    private readonly quoteRepo: IQuoteRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<QuoteWithRecipient> {
    const quote = await this.quoteRepo.findByIdForDoctor(id, doctorId);
    if (!quote) {
      throw new QuoteNotFoundError();
    }

    return { quote, recipientName: await this.resolveRecipientName(quote, doctorId) };
  }

  /**
   * Resuelve el nombre según la restricción XOR de la entidad: o hay paciente o
   * hay lead, nunca los dos.
   *
   * Best-effort: si la búsqueda falla, la cotización se devuelve igual sin
   * nombre. Un fallo resolviendo una etiqueta no puede tumbar el detalle.
   */
  private async resolveRecipientName(quote: Quote, doctorId: string): Promise<string | null> {
    try {
      if (quote.patientId) {
        const patient = await this.patientRepo.findById(quote.patientId, doctorId);
        return patient?.fullName?.trim() || null;
      }

      if (quote.leadId) {
        const lead = await this.leadRepo.findByIdForDoctor(quote.leadId, doctorId);
        if (!lead) return null;
        return [lead.name, lead.lastName].filter(Boolean).join(' ').trim() || null;
      }
    } catch {
      // Sin log: el mensaje podría arrastrar el nombre, que es PII.
      return null;
    }

    return null;
  }
}
