import { SacsXajaxAdapter } from './sacs-xajax.adapter';
import type { MppsVerificationResult } from '../../domain/ports/mpps-verification.port';

/**
 * Real SACS response captured for cedula V-13083881 (a legitimate MÉDICO
 * CIRUJANO, MPPS-65583). Two facts this response proves and the adapter must
 * handle: professions arrive in xajax_tableProfesion (NOT xajax_userTable), and
 * text fields carry HTML entities (M&Eacute;DICO).
 */
const REAL_SACS_XML = `<?xml version="1.0" encoding="UTF-8" ?><xjx><cmd n="js"><![CDATA[$('#divTablaProfesiones').hide();]]></cmd><cmd n="js"><![CDATA[xajax_userTable('{"cedula":"13083881","nombre1":"GERARDO","apellido1":"PEREZ"}');]]></cmd><cmd n="js"><![CDATA[xajax_tableProfesion('[{"licencia":"MPPS-65583","fecha_registro":"2003-12-18","tomo_registro":"96","folio_registro":"62","profesion":"M&Eacute;DICO(A) CIRUJANO(A)","cedula":"13083881"}]');]]></cmd></xjx>`;

const NOT_FOUND_XML = `<?xml version="1.0" encoding="UTF-8" ?><xjx><cmd n="js"><![CDATA[xajax_userTable('');]]></cmd></xjx>`;

type WithParse = { parseResponse(xml: string): MppsVerificationResult };

describe('SacsXajaxAdapter.parseResponse', () => {
  const adapter = new SacsXajaxAdapter();
  const parse = (xml: string): MppsVerificationResult =>
    (adapter as unknown as WithParse).parseResponse(xml);

  it('extracts the person name from xajax_userTable', () => {
    const result = parse(REAL_SACS_XML);
    expect(result.found).toBe(true);
    expect(result.name).toBe('GERARDO PEREZ');
  });

  it('parses professions from xajax_tableProfesion (not a second xajax_userTable)', () => {
    const result = parse(REAL_SACS_XML);
    expect(result.professions).toHaveLength(1);
    expect(result.professions?.[0]?.licencia).toBe('MPPS-65583');
    expect(result.professions?.[0]?.fechaRegistro).toBe('2003-12-18');
  });

  it('decodes HTML entities in the profession field', () => {
    const result = parse(REAL_SACS_XML);
    expect(result.professions?.[0]?.profesion).toBe('MÉDICO(A) CIRUJANO(A)');
  });

  it('returns found=false when the cedula is not registered', () => {
    expect(parse(NOT_FOUND_XML).found).toBe(false);
  });

  it('returns found=false when there is no xajax_userTable call', () => {
    expect(parse('<xjx></xjx>').found).toBe(false);
  });
});
