import { IngestEventsBatchUseCase } from './ingest-events-batch.use-case';
import { ActionEvent } from '../../../domain/entities/action-event.entity';
import { InvalidEventError } from '../../../domain/errors/invalid-event.error';
import type { IActionEventRepository } from '../../../domain/repositories/action-event.repository';
import type { TelemetryEventInput } from '@delta/shared-types';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeRepo(
  overrides: Partial<IActionEventRepository> = {},
): jest.Mocked<IActionEventRepository> {
  return {
    bulkInsert: jest.fn().mockImplementation((events: ActionEvent[]) => Promise.resolve(events)),
    findByDoctor: jest.fn(),
    ...overrides,
  } as jest.Mocked<IActionEventRepository>;
}

function makeEvent(overrides: Partial<TelemetryEventInput> = {}): TelemetryEventInput {
  return {
    action: 'page.view',
    resource_type: 'appointment',
    resource_id: 'c0ffee00-dead-beef-cafe-000000000001',
    metadata: { module: 'agenda' },
    occurred_at: '2026-06-11T10:00:00.000Z',
    session_id: 'sess-abc',
    ...overrides,
  };
}

describe('IngestEventsBatchUseCase', () => {
  let useCase: IngestEventsBatchUseCase;
  let repo: jest.Mocked<IActionEventRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new IngestEventsBatchUseCase(repo);
  });

  it('inserts all valid events and returns correct counts', async () => {
    const events = [makeEvent(), makeEvent({ action: 'button.click' })];
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events });

    expect(result.inserted).toBe(2);
    expect(result.rejected).toBe(0);
    expect(repo.bulkInsert).toHaveBeenCalledTimes(1);
    const savedEvents = repo.bulkInsert.mock.calls[0]![0]!;
    expect(savedEvents).toHaveLength(2);
    expect(savedEvents[0]!.doctorId).toBe(DOCTOR_ID);
    expect(savedEvents[1]!.doctorId).toBe(DOCTOR_ID);
  });

  it('discards events with PII metadata key and reports rejected count', async () => {
    const safeEvent = makeEvent();
    const piiEvent = makeEvent({ metadata: { cedula: 'V-12345678' } });
    const events = [safeEvent, piiEvent];

    const result = await useCase.execute({ doctorId: DOCTOR_ID, events });

    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(repo.bulkInsert).toHaveBeenCalledTimes(1);
    expect(repo.bulkInsert.mock.calls[0]![0]).toHaveLength(1);
  });

  it('discards events with PII email pattern in metadata value', async () => {
    const piiEvent = makeEvent({ metadata: { ref: 'user@example.com' } });
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events: [piiEvent] });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(repo.bulkInsert).not.toHaveBeenCalled();
  });

  it('discards events with Venezuelan cedula pattern V- in metadata value', async () => {
    const piiEvent = makeEvent({ metadata: { tag: 'V-12345678' } });
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events: [piiEvent] });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
  });

  it('discards events with phone number (+58) in metadata value', async () => {
    const piiEvent = makeEvent({ metadata: { contact: '+584121234567' } });
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events: [piiEvent] });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
  });

  it('discards event with PII in resource_id', async () => {
    const piiEvent = makeEvent({ resource_id: 'V-12345678' });
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events: [piiEvent] });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
  });

  it('discards event with empty action', async () => {
    const badEvent = makeEvent({ action: '' });
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events: [badEvent] });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
  });

  it('counts InvalidEventError as rejected (format rejection, not PII)', async () => {
    // Force domain creation to throw InvalidEventError (format rejection)
    jest.spyOn(ActionEvent, 'create').mockImplementationOnce(() => {
      throw new InvalidEventError('simulated format error');
    });
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events: [makeEvent()] });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(repo.bulkInsert).not.toHaveBeenCalled();
  });

  it('skips bulkInsert when all events are rejected', async () => {
    const events = [
      makeEvent({ metadata: { cedula: 'V-99999999' } }),
      makeEvent({ metadata: { email: 'x@y.com' } }),
    ];
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events });

    expect(result.inserted).toBe(0);
    expect(result.rejected).toBe(2);
    expect(repo.bulkInsert).not.toHaveBeenCalled();
  });

  it('assigns doctorId from input, not from event body (anti-IDOR)', async () => {
    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      events: [makeEvent()],
    });

    expect(result.inserted).toBe(1);
    const saved = repo.bulkInsert.mock.calls[0]![0]!;
    expect(saved[0]!.doctorId).toBe(DOCTOR_ID);
  });

  it('accepts null metadata', async () => {
    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      events: [makeEvent({ metadata: null })],
    });

    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('accepts undefined metadata (field omitted)', async () => {
    const eventWithoutMetadata: TelemetryEventInput = {
      action: 'page.view',
      occurred_at: '2026-06-11T10:00:00.000Z',
    };
    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      events: [eventWithoutMetadata],
    });

    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('accepts event with sentry_event_id in metadata', async () => {
    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      events: [makeEvent({ metadata: { sentry_event_id: 'abc123', level: 'error' } })],
    });

    expect(result.inserted).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('processes a maximum-size batch of 200 valid events', async () => {
    const events = Array.from({ length: 200 }, () => makeEvent());
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events });

    expect(result.inserted).toBe(200);
    expect(result.rejected).toBe(0);
    expect(repo.bulkInsert).toHaveBeenCalledTimes(1);
  });

  it('handles mixed valid and invalid events in a large batch', async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      i % 2 === 0 ? makeEvent() : makeEvent({ metadata: { cedula: 'V-12345678' } }),
    );
    const result = await useCase.execute({ doctorId: DOCTOR_ID, events });

    expect(result.inserted).toBe(5);
    expect(result.rejected).toBe(5);
  });

  it('generates unique IDs for each event in the batch', async () => {
    const events = [makeEvent(), makeEvent()];
    await useCase.execute({ doctorId: DOCTOR_ID, events });

    const saved = repo.bulkInsert.mock.calls[0]![0]!;
    const ids = saved.map((e: ActionEvent) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('rethrows non-PII non-format errors from domain creation', async () => {
    // Simulate an unexpected error (not PiiInEventError nor InvalidEventError)
    jest.spyOn(ActionEvent, 'create').mockImplementationOnce(() => {
      throw new TypeError('unexpected domain error');
    });

    await expect(useCase.execute({ doctorId: DOCTOR_ID, events: [makeEvent()] })).rejects.toThrow(
      TypeError,
    );
  });
});
