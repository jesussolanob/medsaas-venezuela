import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import type { WhereOptions } from 'sequelize';
import { Patient } from '../../../domain/entities/patient.entity';
import { PatientNotFoundError } from '../../../domain/errors/patient-not-found.error';
import type {
  IPatientRepository,
  PatientListFilters,
  PatientListResult,
  AuditLogEntry,
} from '../../../domain/repositories/patient.repository';
import { PatientModel } from '../models/patient.model';
import { AccessAuditLogModel } from '../models/access-audit-log.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';

const VALID_SEX_VALUES: ReadonlyArray<Patient['sex']> = ['male', 'female', 'other'];
const VALID_SOURCE_VALUES: ReadonlyArray<Patient['source']> = [
  'booking',
  'manual',
  'import',
  'invitation',
];

/**
 * Validates that a raw DB string is a known sex value; returns null for anything
 * unexpected rather than crashing or silently passing an invalid domain value.
 */
function parseSex(raw: string | null): Patient['sex'] {
  if (raw === null) return null;
  const found = VALID_SEX_VALUES.find((v) => v === raw);
  return found ?? null;
}

/**
 * Coerces a raw DB string into a known PatientSource; returns null for legacy values
 * that predate the closed union (e.g. 'invitation', free-text from old frontend).
 * New writes are validated by Zod before reaching here.
 */
function parseSource(raw: string | null): Patient['source'] {
  if (raw === null) return null;
  const found = VALID_SOURCE_VALUES.find((v) => v === raw);
  return found ?? null;
}

/**
 * Sequelize implementation of IPatientRepository.
 *
 * ENCRYPTION BOUNDARY: all PHI encryption and decryption happens here.
 *   - On write: compute search hashes + encrypt full_name, cedula, phone, email.
 *   - On read: decrypt the PHI fields before constructing the domain entity.
 *
 * The domain layer never sees ciphertext; it always works with plaintext values.
 */
@Injectable()
export class SequelizePatientRepository implements IPatientRepository {
  constructor(
    @InjectModel(PatientModel)
    private readonly patientModel: typeof PatientModel,
    @InjectModel(AccessAuditLogModel)
    private readonly auditLogModel: typeof AccessAuditLogModel,
    private readonly crypto: CryptoService,
  ) {}

  async findById(id: string, doctorId: string): Promise<Patient | null> {
    // Scope to doctorId so a request for a valid-but-foreign patient ID returns null,
    // preventing existence enumeration across doctor boundaries.
    const row = await this.patientModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByCedulaHash(cedulaHash: string, doctorId: string): Promise<Patient | null> {
    const row = await this.patientModel.findOne({
      where: { cedulaSearchHash: cedulaHash, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async findByEmailHash(emailHash: string, doctorId: string): Promise<Patient | null> {
    const row = await this.patientModel.findOne({
      where: { emailSearchHash: emailHash, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  async list(filters: PatientListFilters): Promise<PatientListResult> {
    const where: WhereOptions = { doctorId: filters.doctorId };

    if (filters.source) {
      (where as Record<string, unknown>).source = filters.source;
    }

    const offset = (filters.page - 1) * filters.limit;

    const { count, rows } = await this.patientModel.findAndCountAll({
      where,
      limit: filters.limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count as number,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async findAllByDoctor(doctorId: string): Promise<Patient[]> {
    const rows = await this.patientModel.findAll({
      where: { doctorId } as WhereOptions,
      order: [['createdAt', 'DESC']],
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(patient: Patient): Promise<Patient> {
    const encrypted = this.encryptFields(patient);

    const row = await this.patientModel.create({
      id: patient.id,
      doctorId: patient.doctorId,
      authUserId: patient.authUserId,
      fullName: encrypted.fullName,
      fullNameSearchHash: encrypted.fullNameSearchHash,
      cedula: encrypted.cedula,
      cedulaSearchHash: encrypted.cedulaSearchHash,
      phone: encrypted.phone,
      email: encrypted.email,
      emailSearchHash: encrypted.emailSearchHash,
      identityId: patient.identityId,
      source: patient.source,
      birthDate: patient.birthDate,
      age: patient.age,
      sex: patient.sex,
      bloodType: patient.bloodType,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      address: patient.address,
      city: patient.city,
      emergencyContactName: patient.emergencyContactName,
      emergencyContactPhone: patient.emergencyContactPhone,
      notes: patient.notes,
    });

    return this.toDomain(row);
  }

  async update(id: string, doctorId: string, fields: Partial<Patient>): Promise<Patient> {
    const updateData: Record<string, unknown> = {};

    if (fields.fullName !== undefined) {
      updateData.fullName = this.crypto.encrypt(fields.fullName);
      updateData.fullNameSearchHash = this.crypto.hashForSearch(fields.fullName);
    }
    if (fields.cedula !== undefined) {
      updateData.cedula = fields.cedula ? this.crypto.encrypt(fields.cedula) : null;
      updateData.cedulaSearchHash = fields.cedula ? this.crypto.hashForSearch(fields.cedula) : null;
    }
    if (fields.phone !== undefined) {
      updateData.phone = fields.phone ? this.crypto.encrypt(fields.phone) : null;
    }
    if (fields.email !== undefined) {
      updateData.email = fields.email ? this.crypto.encrypt(fields.email) : null;
      updateData.emailSearchHash = fields.email ? this.crypto.hashForSearch(fields.email) : null;
    }

    // Non-PHI fields — copy directly
    const plainFields: Array<keyof Patient> = [
      'source',
      'birthDate',
      'age',
      'sex',
      'bloodType',
      'allergies',
      'chronicConditions',
      'address',
      'city',
      'emergencyContactName',
      'emergencyContactPhone',
      'notes',
    ];
    for (const key of plainFields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        updateData[key] = fields[key];
      }
    }

    // Scope update to doctorId — prevents cross-doctor mutation even if IDs are guessed.
    await this.patientModel.update(updateData, { where: { id, doctorId } as WhereOptions });
    // Re-fetch scoped to the same doctorId to confirm the row still exists and belongs to this doctor.
    const updated = await this.patientModel.findOne({ where: { id, doctorId } as WhereOptions });
    if (!updated) {
      // Row was not found — either it never existed for this doctor, or was concurrently deleted.
      throw new PatientNotFoundError();
    }
    return this.toDomain(updated);
  }

  async softDelete(id: string, doctorId: string): Promise<void> {
    // Scope to doctorId — prevents deleting a patient owned by a different doctor.
    await this.patientModel.destroy({ where: { id, doctorId } as WhereOptions });
  }

  async logReveal(entry: AuditLogEntry): Promise<void> {
    await this.auditLogModel.create({
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      patientId: entry.patientId,
      fieldRevealed: entry.fieldRevealed,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private encryptFields(patient: Patient): {
    fullName: string;
    fullNameSearchHash: string;
    cedula: string | null;
    cedulaSearchHash: string | null;
    phone: string | null;
    email: string | null;
    emailSearchHash: string | null;
  } {
    return {
      fullName: this.crypto.encrypt(patient.fullName),
      fullNameSearchHash: this.crypto.hashForSearch(patient.fullName),
      cedula: patient.cedula ? this.crypto.encrypt(patient.cedula) : null,
      cedulaSearchHash: patient.cedula ? this.crypto.hashForSearch(patient.cedula) : null,
      phone: patient.phone ? this.crypto.encrypt(patient.phone) : null,
      email: patient.email ? this.crypto.encrypt(patient.email) : null,
      emailSearchHash: patient.email ? this.crypto.hashForSearch(patient.email) : null,
    };
  }

  private toDomain(row: PatientModel): Patient {
    return Patient.create({
      id: row.id,
      doctorId: row.doctorId,
      authUserId: row.authUserId,
      fullName: this.crypto.decrypt(row.fullName),
      cedula: row.cedula ? this.crypto.decrypt(row.cedula) : null,
      phone: row.phone ? this.crypto.decrypt(row.phone) : null,
      email: row.email ? this.crypto.decrypt(row.email) : null,
      identityId: row.identityId ?? null,
      source: parseSource(row.source),
      birthDate: row.birthDate,
      age: row.age,
      sex: parseSex(row.sex),
      bloodType: row.bloodType,
      allergies: row.allergies,
      chronicConditions: row.chronicConditions,
      address: row.address,
      city: row.city,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      notes: row.notes,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
