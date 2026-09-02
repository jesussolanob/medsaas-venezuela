import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerSpecialistRow,
} from '../../domain/repositories/seller.repository';
import { SpecialistNotInPortfolioError } from '../../domain/errors/specialist-not-in-portfolio.error';

export interface UpdateSellerSpecialistInput {
  /** undefined = no tocar. null o '' = borrar. */
  phone?: string | null;
  /** undefined = no tocar. null o '' = borrar. */
  sellerNotes?: string | null;
}

/**
 * UpdateSellerSpecialistUseCase
 *
 * El vendedor completa el teléfono y sus notas sobre un especialista de su
 * cartera. Nace de que un especialista ASIGNADO por el admin llega sin teléfono
 * y la ficha del portal era de solo lectura: no había forma de cargarlo.
 *
 * Solo esos dos campos. Nada de plan, rol, correo ni estado de la cuenta.
 *
 * SECURITY:
 *   - sellerId siempre sale de CurrentUserPayload.sub — nunca del cuerpo.
 *   - Un especialista inexistente y uno de otro vendedor devuelven el MISMO
 *     error, para no poder enumerar carteras ajenas (anti-IDOR).
 *   - El teléfono y las notas son PII: nunca se loguean.
 */
@Injectable()
export class UpdateSellerSpecialistUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(
    sellerId: string,
    specialistId: string,
    input: UpdateSellerSpecialistInput,
  ): Promise<SellerSpecialistRow> {
    // Un campo vacío se guarda como null, no como cadena vacía: así "sin
    // teléfono" es un solo valor en la BD y no dos que se ven igual.
    const patch: UpdateSellerSpecialistInput = {};
    if (input.phone !== undefined) {
      const v = input.phone?.trim() ?? '';
      patch.phone = v === '' ? null : v;
    }
    if (input.sellerNotes !== undefined) {
      const v = input.sellerNotes?.trim() ?? '';
      patch.sellerNotes = v === '' ? null : v;
    }

    const updated = await this.sellerRepo.updateSoldSpecialistContact(
      sellerId,
      specialistId,
      patch,
    );

    if (!updated) {
      throw new SpecialistNotInPortfolioError();
    }

    return updated;
  }
}
