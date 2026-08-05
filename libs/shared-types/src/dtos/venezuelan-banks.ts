import { z } from 'zod';

/**
 * Catalog of Venezuelan bank institutions with their 4-digit BCV institution codes.
 *
 * Used for:
 *   - Validating `bank_code` when a doctor submits a subscription payment comprobante.
 *   - Populating the bank selector in the checkout modal on the frontend.
 *
 * Source: Banco Central de Venezuela (BCV) — official bank directory.
 */
export const VENEZUELAN_BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: '0102', name: 'Banco de Venezuela' },
  { code: '0104', name: 'Venezolano de Crédito' },
  { code: '0105', name: 'Mercantil' },
  { code: '0108', name: 'BBVA Provincial' },
  { code: '0114', name: 'Bancaribe' },
  { code: '0115', name: 'Exterior' },
  { code: '0128', name: 'Banco Caroní' },
  { code: '0134', name: 'Banesco' },
  { code: '0137', name: 'Sofitasa' },
  { code: '0138', name: 'Banco Plaza' },
  { code: '0146', name: 'Bangente' },
  { code: '0151', name: 'BFC Banco Fondo Común' },
  { code: '0156', name: '100% Banco' },
  { code: '0157', name: 'DelSur' },
  { code: '0163', name: 'Banco del Tesoro' },
  { code: '0166', name: 'Banco Agrícola de Venezuela' },
  { code: '0168', name: 'Bancrecer' },
  { code: '0169', name: 'Mi Banco' },
  { code: '0171', name: 'Banco Activo' },
  { code: '0172', name: 'Bancamiga' },
  { code: '0173', name: 'Banco Internacional de Desarrollo' },
  { code: '0174', name: 'Banplus' },
  { code: '0175', name: 'Banco Bicentenario' },
  { code: '0177', name: 'Banfanb' },
  { code: '0191', name: 'BNC' },
];

/** Set of valid bank codes for O(1) validation. */
const VALID_BANK_CODES = new Set(VENEZUELAN_BANKS.map((b) => b.code));

/**
 * Zod schema that validates a 4-digit Venezuelan bank institution code
 * against the VENEZUELAN_BANKS catalog.
 */
export const BankCodeSchema = z.string().refine((v) => VALID_BANK_CODES.has(v), {
  message: 'Código de banco no reconocido. Verificá el catálogo de bancos venezolanos.',
});

export type BankCode = z.infer<typeof BankCodeSchema>;
