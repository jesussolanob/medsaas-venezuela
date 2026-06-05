import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, fn, literal } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { Message } from '../../../domain/entities/message.entity';
import type {
  IMessageRepository,
  ThreadSummary,
} from '../../../domain/repositories/message.repository';
import { MessageModel } from '../models/message.model';
import { PatientModel } from '../../../../patients/infrastructure/database/models/patient.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

const VALID_DIRECTIONS = ['patient_to_doctor', 'doctor_to_patient'] as const;
type MessageDirection = (typeof VALID_DIRECTIONS)[number];

function parseDirection(raw: string): MessageDirection {
  const found = VALID_DIRECTIONS.find((d) => d === raw);
  return found ?? 'doctor_to_patient';
}

/**
 * Sequelize implementation of IMessageRepository.
 *
 * ENCRYPTION BOUNDARY: body encryption/decryption happens exclusively here.
 *   - On write: encrypt plaintext body before INSERT.
 *   - On read:  decrypt body before constructing the domain entity.
 *
 * The domain layer always works with plaintext values.
 * NEVER log the decrypted body or any PII field.
 */
@Injectable()
export class SequelizeMessageRepository implements IMessageRepository {
  constructor(
    @InjectModel(MessageModel)
    private readonly messageModel: typeof MessageModel,
    @InjectModel(PatientModel)
    private readonly patientModel: typeof PatientModel,
    private readonly crypto: CryptoService,
  ) {}

  async listThreads(doctorId: string): Promise<ThreadSummary[]> {
    // Fetch all messages for this doctor, ordered newest-first so we can
    // determine the last message per patient efficiently in application memory.
    const rows = await this.messageModel.findAll({
      where: { doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });

    if (rows.length === 0) return [];

    // Build per-patient aggregations.
    const threadMap = new Map<
      string,
      { lastMessageAt: Date; unreadCount: number }
    >();

    for (const row of rows) {
      const existing = threadMap.get(row.patientId);
      if (!existing) {
        threadMap.set(row.patientId, {
          lastMessageAt: row.createdAt,
          unreadCount: 0,
        });
      }
      // Count unread patient-to-doctor messages.
      if (row.direction === 'patient_to_doctor' && row.readAt === null) {
        const entry = threadMap.get(row.patientId)!;
        threadMap.set(row.patientId, {
          ...entry,
          unreadCount: entry.unreadCount + 1,
        });
      }
    }

    const patientIds = Array.from(threadMap.keys());

    // Fetch patient rows to resolve names (encrypted — decrypt here).
    const patients = await this.patientModel.findAll({
      where: { id: { [Op.in]: patientIds } } as WhereOptions,
    });

    const threads: ThreadSummary[] = [];

    for (const patientId of patientIds) {
      const aggregation = threadMap.get(patientId)!;
      const patientRow = patients.find((p) => p.id === patientId);
      let patientName = 'Paciente desconocido';
      if (patientRow?.fullName) {
        try {
          // Decrypt the encrypted name — masking is applied in the presentation layer.
          patientName = this.crypto.decrypt(patientRow.fullName);
        } catch {
          // Guard against corrupted ciphertext — fallback to placeholder.
          patientName = 'Paciente desconocido';
        }
      }

      threads.push({
        patientId,
        patientName,
        lastMessageAt: aggregation.lastMessageAt,
        unreadCount: aggregation.unreadCount,
      });
    }

    // Sort by most recent message first.
    threads.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    return threads;
  }

  async findThread(doctorId: string, patientId: string): Promise<Message[]> {
    const rows = await this.messageModel.findAll({
      where: { doctorId, patientId } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });

    return rows.map((row) => this.toDomain(row));
  }

  async markThreadRead(doctorId: string, patientId: string): Promise<void> {
    await this.messageModel.update(
      { readAt: fn('NOW') },
      {
        where: {
          doctorId,
          patientId,
          direction: 'patient_to_doctor',
          readAt: { [Op.is]: literal('NULL') },
        } as WhereOptions,
      },
    );
  }

  async save(message: Message): Promise<Message> {
    // Encrypt the plaintext body before persisting.
    const encryptedBody = this.crypto.encrypt(message.body);

    const row = await this.messageModel.create({
      id: message.id,
      doctorId: message.doctorId,
      patientId: message.patientId,
      body: encryptedBody,
      direction: message.direction,
      readAt: message.readAt,
      createdAt: message.createdAt,
    });

    return this.toDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: MessageModel): Message {
    return Message.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      body: this.crypto.decrypt(row.body),
      direction: parseDirection(row.direction),
      readAt: row.readAt,
      createdAt: row.createdAt,
    });
  }
}
