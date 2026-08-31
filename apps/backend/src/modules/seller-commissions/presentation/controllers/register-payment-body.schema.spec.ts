import { RegisterPaymentBodySchema } from './seller-commissions.controller';
import { buildStoragePath } from '../../../storage/application/use-cases/upload-file.use-case';

/**
 * Guarda del contrato del body de registro de pago.
 *
 * POR QUÉ EXISTE
 * --------------
 * `receipt_url` validaba `.url()`, pero desde el rediseño del comprobante lo que
 * viaja es el **path** del objeto en GCS —los comprobantes son privados y la URL
 * se firma a demanda—. Un path nunca pasa una validación de URL, así que registrar
 * un pago con comprobante fallaba con "Invalid URL".
 *
 * Ningún test lo detectó porque ninguno ejercitaba el esquema con un path real:
 * los tests del use case reciben el valor ya validado. Se descubrió recién al
 * subir un archivo de verdad en staging.
 *
 * El caso clave es el primero: usa `buildStoragePath`, la MISMA función que
 * genera el path en producción, en vez de un string escrito a mano que podría
 * divergir del formato real sin que nadie se entere.
 */
describe('RegisterPaymentBodySchema — receipt_url', () => {
  const BASE = {
    seller_id: '11111111-1111-4111-8111-111111111111',
    commission_ids: ['22222222-2222-4222-8222-222222222222'],
    method: 'Pago Móvil',
    reference: '0001234567890',
  };

  it('acepta el path que realmente genera el storage', () => {
    const path = buildStoragePath(
      'receipt',
      '33333333-3333-4333-8333-333333333333',
      'comprobante prueba.png',
    );

    const r = RegisterPaymentBodySchema.safeParse({ ...BASE, receipt_url: path });

    expect(r.success).toBe(true);
  });

  it('acepta un pago sin comprobante', () => {
    expect(RegisterPaymentBodySchema.safeParse(BASE).success).toBe(true);
    expect(RegisterPaymentBodySchema.safeParse({ ...BASE, receipt_url: null }).success).toBe(true);
  });

  it('rechaza un path que intente salir de su carpeta', () => {
    const r = RegisterPaymentBodySchema.safeParse({
      ...BASE,
      receipt_url: 'receipt/../../secretos/passwd',
    });

    expect(r.success).toBe(false);
  });

  it('rechaza un comprobante vacío', () => {
    expect(RegisterPaymentBodySchema.safeParse({ ...BASE, receipt_url: '' }).success).toBe(false);
  });

  it('el mensaje de error está en español', () => {
    const r = RegisterPaymentBodySchema.safeParse({ ...BASE, receipt_url: 'no vale' });

    expect(r.success).toBe(false);
    if (!r.success) {
      // El GlobalExceptionFilter reenvía este texto tal cual al navegador, así que
      // no puede salir en inglés. "Invalid URL" fue exactamente lo que vio el admin.
      expect(r.error.issues[0]?.message).toBe('El comprobante no es válido.');
    }
  });

  it('rechaza un monto mandado por el cliente (el servidor lo calcula)', () => {
    const r = RegisterPaymentBodySchema.safeParse({ ...BASE, amount_usd: 999999 });

    // .strict(): una clave de más es rechazada, no ignorada en silencio.
    expect(r.success).toBe(false);
  });
});
