import { Inject, Injectable } from '@nestjs/common';
import {
  SELLER_REPOSITORY,
  type ISellerRepository,
  type SellerAdminRow,
} from '../../domain/repositories/seller.repository';

/**
 * ListSellersUseCase
 *
 * Devuelve todos los vendedores para el panel del super administrador, con
 * cuántos especialistas dio de alta cada uno.
 *
 * Security:
 *   - El llamador DEBE protegerlo con @Roles('super_admin'): solo el super
 *     administrador gestiona vendedores (decisión del dueño, 2026-08-17).
 *   - Devuelve nombre y correo del VENDEDOR (no de pacientes). Nunca loguear.
 */
@Injectable()
export class ListSellersUseCase {
  constructor(
    @Inject(SELLER_REPOSITORY)
    private readonly sellerRepo: ISellerRepository,
  ) {}

  async execute(): Promise<SellerAdminRow[]> {
    return this.sellerRepo.listSellers();
  }
}
