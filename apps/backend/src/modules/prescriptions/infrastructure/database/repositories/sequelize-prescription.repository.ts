import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { Prescription } from '../../../domain/entities/prescription.entity';
import { DecryptionError } from '../../../domain/errors/decryption.error';
import type { IPrescriptionRepository } from '../../../domain/repositories/prescription.repository';
import { PrescriptionModel } from '../models/prescription.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

/**
 * Sequelize implementation of IPrescriptionRepository.
 *
 * ENCRYPTION BOUNDARY: all PHI encryption and decryption happens here.
 *   - On write: encrypt medication, dosage.
 *   - On read: decrypt those fields before constructing the domain entity.
 *   - frequency, duration, notes are stored in plaintext (not PHI).
 *
 * The domain layer never sees ciphertext; it always works with plaintext values.
 */
@Injectable()
export class SequelizePrescriptionRepository implements IPrescriptionRepository {
  constructor(
    @InjectModel(PrescriptionModel)
    private readonly prescriptionModel: typeof PrescriptionModel,
    private readonly crypto: CryptoService,
  ) {}

  async findById(id: string, doctorId: string): Promise<Prescription | null> {
    const row = await this.prescriptionModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByPatient(patientId: string, doctorId: string): Promise<Prescription[]> {
    const rows = await this.prescriptionModel.findAll({
      where: { patientId, doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findByConsultation(consultationId: string, doctorId: string): Promise<Prescription[]> {
    const rows = await this.prescriptionModel.findAll({
      where: { consultationId, doctorId } as WhereOptions,
      order: [['createdAt', 'ASC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(prescription: Prescription): Promise<Prescription> {
    const row = await this.prescriptionModel.create({
      id: prescription.id,
      doctorId: prescription.doctorId,
      patientId: prescription.patientId,
      consultationId: prescription.consultationId,
      medication: this.crypto.encrypt(prescription.medication),
      dosage: prescription.dosage ? this.crypto.encrypt(prescription.dosage) : null,
      frequency: prescription.frequency,
      duration: prescription.duration,
      notes: prescription.notes,
    });
    return this.toDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PrescriptionModel): Prescription {
    return Prescription.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      consultationId: row.consultationId,
      medication: this.requireDecrypt(row.medication, 'medication'),
      dosage: this.safeDecrypt(row.dosage, 'dosage'),
      frequency: row.frequency,
      duration: row.duration,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  /**
   * Decrypts a nullable ciphertext field and wraps any crypto error in a
   * typed DomainError so GlobalExceptionFilter returns 422 (not 500).
   *
   * The field name in the error message never contains PHI — it is only the
   * column name, which is safe for logs and client error responses.
   */
  private safeDecrypt(value: string | null, field: string): string | null {
    if (!value) return null;
    try {
      return this.crypto.decrypt(value);
    } catch {
      throw new DecryptionError(field);
    }
  }

  /**
   * Decrypts a NOT NULL ciphertext field. A null result means a broken
   * invariant (the column is non-nullable), so it throws instead of coercing.
   */
  private requireDecrypt(value: string | null, field: string): string {
    const decrypted = this.safeDecrypt(value, field);
    if (decrypted === null) {
      throw new DecryptionError(field);
    }
    return decrypted;
  }
}
