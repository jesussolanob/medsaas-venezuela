import { ConsultationBlock } from './consultation-block.entity';

describe('ConsultationBlock entity', () => {
  const params = {
    key: 'chief_complaint',
    label: 'Motivo de consulta',
    contentType: 'rich_text' as const,
    enabled: true,
    sortOrder: 1,
    printable: true,
    sendToPatient: true,
    description: 'Descripción del bloque',
    customDescription: null,
  };

  it('constructs with all provided params', () => {
    const block = new ConsultationBlock(params);

    expect(block.key).toBe('chief_complaint');
    expect(block.label).toBe('Motivo de consulta');
    expect(block.contentType).toBe('rich_text');
    expect(block.enabled).toBe(true);
    expect(block.sortOrder).toBe(1);
    expect(block.printable).toBe(true);
    expect(block.sendToPatient).toBe(true);
    expect(block.description).toBe('Descripción del bloque');
    expect(block.customDescription).toBeNull();
  });

  it('stores disabled state correctly', () => {
    const block = new ConsultationBlock({ ...params, enabled: false });
    expect(block.enabled).toBe(false);
  });

  it('stores non-printable state correctly', () => {
    const block = new ConsultationBlock({ ...params, printable: false, sendToPatient: false });
    expect(block.printable).toBe(false);
    expect(block.sendToPatient).toBe(false);
  });

  it('stores all supported content types', () => {
    const types = ['rich_text', 'list', 'date', 'file', 'structured', 'numeric'] as const;
    for (const ct of types) {
      const block = new ConsultationBlock({ ...params, contentType: ct });
      expect(block.contentType).toBe(ct);
    }
  });

  it('uses customDescription when provided', () => {
    const block = new ConsultationBlock({
      ...params,
      customDescription: 'Mi descripción personalizada',
      description: 'Mi descripción personalizada',
    });
    expect(block.customDescription).toBe('Mi descripción personalizada');
    expect(block.description).toBe('Mi descripción personalizada');
  });

  it('falls back description to catalog when customDescription is null', () => {
    const block = new ConsultationBlock({
      ...params,
      customDescription: null,
      description: 'Descripción del catálogo',
    });
    expect(block.customDescription).toBeNull();
    expect(block.description).toBe('Descripción del catálogo');
  });

  it('stores null description when neither doctor nor catalog has one', () => {
    const block = new ConsultationBlock({
      ...params,
      customDescription: null,
      description: null,
    });
    expect(block.description).toBeNull();
    expect(block.customDescription).toBeNull();
  });
});
