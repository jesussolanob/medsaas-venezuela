import { Message, type MessageCreateParams } from './message.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeParams(overrides: Partial<MessageCreateParams> = {}): MessageCreateParams {
  return {
    id: 'mmmmmmmm-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    body: 'Hello, how are you feeling today?',
    direction: 'doctor_to_patient',
    readAt: null,
    createdAt: now,
    ...overrides,
  };
}

describe('Message entity', () => {
  describe('create', () => {
    it('creates a message with all fields', () => {
      const msg = Message.create(makeParams());

      expect(msg.id).toBe('mmmmmmmm-0000-0000-0000-000000000001');
      expect(msg.doctorId).toBe(DOCTOR_ID);
      expect(msg.patientId).toBe(PATIENT_ID);
      expect(msg.body).toBe('Hello, how are you feeling today?');
      expect(msg.direction).toBe('doctor_to_patient');
      expect(msg.readAt).toBeNull();
      expect(msg.createdAt).toBe(now);
    });

    it('creates a patient_to_doctor message', () => {
      const msg = Message.create(makeParams({ direction: 'patient_to_doctor' }));

      expect(msg.direction).toBe('patient_to_doctor');
    });

    it('stores readAt when provided', () => {
      const readAt = new Date('2026-06-05T10:00:00Z');
      const msg = Message.create(makeParams({ readAt }));

      expect(msg.readAt).toBe(readAt);
    });
  });

  describe('canBeReadBy', () => {
    it('returns true when the given doctorId matches the message owner', () => {
      const msg = Message.create(makeParams());

      expect(msg.canBeReadBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false when the given doctorId does not match', () => {
      const msg = Message.create(makeParams());

      expect(msg.canBeReadBy(OTHER_DOCTOR_ID)).toBe(false);
    });
  });

  describe('isFromPatient', () => {
    it('returns true for patient_to_doctor direction', () => {
      const msg = Message.create(makeParams({ direction: 'patient_to_doctor' }));

      expect(msg.isFromPatient()).toBe(true);
    });

    it('returns false for doctor_to_patient direction', () => {
      const msg = Message.create(makeParams({ direction: 'doctor_to_patient' }));

      expect(msg.isFromPatient()).toBe(false);
    });
  });

  describe('isFromDoctor', () => {
    it('returns true for doctor_to_patient direction', () => {
      const msg = Message.create(makeParams({ direction: 'doctor_to_patient' }));

      expect(msg.isFromDoctor()).toBe(true);
    });

    it('returns false for patient_to_doctor direction', () => {
      const msg = Message.create(makeParams({ direction: 'patient_to_doctor' }));

      expect(msg.isFromDoctor()).toBe(false);
    });
  });
});
