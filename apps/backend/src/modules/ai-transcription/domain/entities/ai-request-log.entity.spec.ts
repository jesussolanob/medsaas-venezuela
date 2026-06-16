import { AiRequestLog } from './ai-request-log.entity';

describe('AiRequestLog', () => {
  const params = {
    id: 'abc-123',
    doctorId: 'doc-456',
    feature: 'transcription',
    status: 'success',
    audioBytes: 1024,
    model: 'gemini-2.5-flash',
  };

  describe('create()', () => {
    it('creates an instance with all provided fields', () => {
      const log = AiRequestLog.create(params);

      expect(log.id).toBe('abc-123');
      expect(log.doctorId).toBe('doc-456');
      expect(log.feature).toBe('transcription');
      expect(log.status).toBe('success');
      expect(log.audioBytes).toBe(1024);
      expect(log.model).toBe('gemini-2.5-flash');
    });

    it('sets createdAt to a recent Date', () => {
      const before = Date.now();
      const log = AiRequestLog.create(params);
      const after = Date.now();

      expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(log.createdAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('creates separate instances independently', () => {
      const log1 = AiRequestLog.create({ ...params, status: 'error' });
      const log2 = AiRequestLog.create({ ...params, status: 'denied' });

      expect(log1.status).toBe('error');
      expect(log2.status).toBe('denied');
      expect(log1).not.toBe(log2);
    });

    it('accepts audioBytes of zero', () => {
      const log = AiRequestLog.create({ ...params, audioBytes: 0 });
      expect(log.audioBytes).toBe(0);
    });
  });
});
