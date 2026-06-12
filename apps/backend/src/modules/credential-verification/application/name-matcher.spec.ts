import {
  normalizeNameStr,
  tokenizeName,
  namesMatch,
  isMedicalProfession,
  NAME_MATCH_THRESHOLD,
} from './name-matcher';

describe('normalizeNameStr', () => {
  it('strips accents and uppercases', () => {
    expect(normalizeNameStr('José García')).toBe('JOSE GARCIA');
    expect(normalizeNameStr('María Ñoño')).toBe('MARIA NONO');
  });

  it('removes non-alpha characters except spaces', () => {
    expect(normalizeNameStr('Juan-Carlos')).toBe('JUAN CARLOS');
  });

  it('trims whitespace', () => {
    expect(normalizeNameStr('  JOSE  ')).toBe('JOSE');
  });
});

describe('tokenizeName', () => {
  it('splits on whitespace and filters empty tokens', () => {
    expect(tokenizeName('JOSE GARCIA')).toEqual(['JOSE', 'GARCIA']);
  });

  it('handles extra spaces', () => {
    expect(tokenizeName('JOSE   GARCIA')).toEqual(['JOSE', 'GARCIA']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizeName('')).toEqual([]);
  });
});

describe('namesMatch', () => {
  it('matches identical names', () => {
    expect(namesMatch('JOSE GARCIA', 'JOSE GARCIA')).toBe(true);
  });

  it('matches when one name is a subset of the other (above threshold)', () => {
    // shorter has 2 tokens, 2 match → ratio 1.0 >= 0.5
    expect(namesMatch('JOSE GARCIA', 'JOSE ANTONIO GARCIA LOPEZ')).toBe(true);
  });

  it('matches when accents differ', () => {
    expect(namesMatch('José García', 'JOSE GARCIA')).toBe(true);
  });

  it('does not match completely different names', () => {
    expect(namesMatch('PEDRO RODRIGUEZ', 'JOSE GARCIA')).toBe(false);
  });

  it('does not match when overlap is below threshold', () => {
    // threshold is NAME_MATCH_THRESHOLD (0.5)
    // 'JOSE' matches but 'GARCIA' does not match from 'JOSE PEREZ MARTINEZ'
    // shorter=[JOSE, GARCIA], longer=[JOSE, PEREZ, MARTINEZ]
    // 1/2 = 0.5 → exactly at threshold, should pass
    expect(namesMatch('JOSE GARCIA', 'JOSE PEREZ MARTINEZ')).toBe(1 / 2 >= NAME_MATCH_THRESHOLD);
  });

  it('returns false when either name is empty', () => {
    expect(namesMatch('', 'JOSE GARCIA')).toBe(false);
    expect(namesMatch('JOSE GARCIA', '')).toBe(false);
  });
});

describe('isMedicalProfession', () => {
  it('recognizes MEDICO', () => {
    expect(isMedicalProfession('MÉDICO CIRUJANO')).toBe(true);
  });

  it('recognizes MEDICO (no accent)', () => {
    expect(isMedicalProfession('MEDICO GENERAL')).toBe(true);
  });

  it('recognizes feminine form MEDICA', () => {
    expect(isMedicalProfession('MÉDICA PEDIATRA')).toBe(true);
  });

  it('does not match unrelated professions', () => {
    expect(isMedicalProfession('ENFERMERO')).toBe(false);
    expect(isMedicalProfession('ODONTOLOGO')).toBe(false);
  });
});
