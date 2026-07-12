import { ConsultationExtraItem } from './consultation-extra-item.entity';

const BASE_PARAMS = {
  id: 'eeeeeeee-0000-0000-0000-000000000001',
  consultationId: 'cccccccc-0000-0000-0000-000000000001',
  doctorId: 'dddddddd-0000-0000-0000-000000000001',
  description: 'Limpieza dental',
  amountUsd: 20,
  createdAt: new Date('2026-07-12T00:00:00Z'),
};

describe('ConsultationExtraItem entity', () => {
  it('creates a valid extra item', () => {
    const item = ConsultationExtraItem.create(BASE_PARAMS);
    expect(item.id).toBe(BASE_PARAMS.id);
    expect(item.consultationId).toBe(BASE_PARAMS.consultationId);
    expect(item.doctorId).toBe(BASE_PARAMS.doctorId);
    expect(item.description).toBe('Limpieza dental');
    expect(item.amountUsd).toBe(20);
    expect(item.createdAt).toEqual(BASE_PARAMS.createdAt);
  });

  it('trims whitespace from description', () => {
    const item = ConsultationExtraItem.create({ ...BASE_PARAMS, description: '  ECG  ' });
    expect(item.description).toBe('ECG');
  });

  it('throws when description is empty', () => {
    expect(() => ConsultationExtraItem.create({ ...BASE_PARAMS, description: '' })).toThrow(
      'description must not be empty',
    );
  });

  it('throws when description is only whitespace', () => {
    expect(() => ConsultationExtraItem.create({ ...BASE_PARAMS, description: '   ' })).toThrow(
      'description must not be empty',
    );
  });

  it('throws when amountUsd is zero', () => {
    expect(() => ConsultationExtraItem.create({ ...BASE_PARAMS, amountUsd: 0 })).toThrow(
      'amountUsd must be a positive finite number',
    );
  });

  it('throws when amountUsd is negative', () => {
    expect(() => ConsultationExtraItem.create({ ...BASE_PARAMS, amountUsd: -5 })).toThrow(
      'amountUsd must be a positive finite number',
    );
  });

  it('throws when amountUsd is NaN', () => {
    expect(() => ConsultationExtraItem.create({ ...BASE_PARAMS, amountUsd: NaN })).toThrow(
      'amountUsd must be a positive finite number',
    );
  });

  it('throws when amountUsd is Infinity', () => {
    expect(() => ConsultationExtraItem.create({ ...BASE_PARAMS, amountUsd: Infinity })).toThrow(
      'amountUsd must be a positive finite number',
    );
  });
});
