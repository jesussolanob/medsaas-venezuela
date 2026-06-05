/**
 * Message domain entity.
 *
 * Holds decrypted (plaintext) body in memory — encryption/decryption is the
 * responsibility of the infrastructure layer (SequelizeMessageRepository).
 *
 * Invariants:
 *   - canBeReadBy()  enforces doctor ownership (anti-IDOR).
 *   - isFromPatient() / isFromDoctor() encapsulate direction semantics.
 */

export type MessageDirection = 'patient_to_doctor' | 'doctor_to_patient';

export interface MessageCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  /** Plaintext body — never ciphertext. */
  body: string;
  direction: MessageDirection;
  readAt: Date | null;
  createdAt: Date;
}

export class Message {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly body: string;
  readonly direction: MessageDirection;
  readonly readAt: Date | null;
  readonly createdAt: Date;

  constructor(params: MessageCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.body = params.body;
    this.direction = params.direction;
    this.readAt = params.readAt;
    this.createdAt = params.createdAt;
  }

  /**
   * Returns true when the given doctor is the owner of this message thread.
   * Used to enforce anti-IDOR on all read and write operations.
   */
  canBeReadBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /** Returns true when the message was sent by the patient. */
  isFromPatient(): boolean {
    return this.direction === 'patient_to_doctor';
  }

  /** Returns true when the message was sent by the doctor. */
  isFromDoctor(): boolean {
    return this.direction === 'doctor_to_patient';
  }

  /** Factory — creates a Message value from raw data. Does not persist. */
  static create(params: MessageCreateParams): Message {
    return new Message(params);
  }
}
