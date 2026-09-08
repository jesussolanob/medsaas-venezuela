import { toCanonicalCedula, cedulaSchema } from '@delta/shared-types';
import { normalizeCedulaForSearch } from '@delta/shared-crypto';

/**
 * La cédula tiene DOS formas y tienen que estar de acuerdo:
 *
 *   - `toCanonicalCedula`      → cómo se GUARDA        ('V-12345678')
 *   - `normalizeCedulaForSearch` → sobre qué se HASHEA ('V12345678')
 *
 * Si alguna vez discrepan en qué consideran "la misma cédula", el sistema vuelve
 * a poder registrar dos veces a la misma persona. Vive en el backend y no en
 * `libs/shared-types` porque esa librería no tiene corrida de tests propia.
 */
describe('Forma canónica de la cédula', () => {
  /** Todas estas son la MISMA persona, escritas como las tipearía cualquiera. */
  const MISMA_PERSONA = [
    'V-12345678',
    'v-12345678',
    'V12345678',
    'v.12.345.678',
    'V 12345678',
    'V--12345678',
    '  V-12345678  ',
  ];

  it('guarda todas las variantes en una sola forma', () => {
    const formas = new Set(MISMA_PERSONA.map(toCanonicalCedula));
    expect([...formas]).toEqual(['V-12345678']);
  });

  it('la forma guardada pasa la validación que exige el guion', () => {
    // Sin esto, editar un paciente fallaría: la pantalla relee el valor guardado
    // y lo vuelve a enviar, y `cedulaSchema` exige el formato V/E/P-<valor>.
    for (const variante of MISMA_PERSONA) {
      expect(cedulaSchema.safeParse(toCanonicalCedula(variante)).success).toBe(true);
    }
  });

  it('lo guardado y lo hasheado coinciden en quién es la misma persona', () => {
    // La huella se calcula SIN separadores; el valor guardado los conserva. Las
    // dos tienen que agrupar exactamente igual, o vuelven los duplicados.
    const huellas = new Set(MISMA_PERSONA.map(normalizeCedulaForSearch));
    expect(huellas.size).toBe(1);
    expect(normalizeCedulaForSearch(toCanonicalCedula('v.12.345.678'))).toBe(
      normalizeCedulaForSearch('V-12345678'),
    );
  });

  it('conserva los prefijos de extranjero y pasaporte', () => {
    expect(toCanonicalCedula('e-8123456')).toBe('E-8123456');
    expect(toCanonicalCedula('p.ab123456')).toBe('P-AB123456');
  });

  it('NO le inventa un prefijo a una cédula que no lo trae', () => {
    // Suponer la nacionalidad de un paciente sería inventarle un dato clínico.
    expect(toCanonicalCedula('12345678')).toBe('12345678');
  });

  it('devuelve cadena vacía cuando no hay nada que normalizar', () => {
    expect(toCanonicalCedula('   ')).toBe('');
    expect(toCanonicalCedula('---')).toBe('');
  });
});
