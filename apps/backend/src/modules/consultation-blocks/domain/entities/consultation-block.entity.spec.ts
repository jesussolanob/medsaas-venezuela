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
});
