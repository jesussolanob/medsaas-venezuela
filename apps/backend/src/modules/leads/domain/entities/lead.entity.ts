import { LeadInvalidStageError } from '../errors/lead-invalid-stage.error';

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'appointment' | 'converted' | 'lost';
export type LeadChannel = 'whatsapp' | 'instagram' | 'facebook' | 'web' | 'llamada' | 'referido';

const VALID_STAGES: readonly LeadStage[] = [
  'new',
  'contacted',
  'qualified',
  'appointment',
  'converted',
  'lost',
];

export interface LeadCreateParams {
  id: string;
  doctorId: string;
  name: string;
  lastName?: string | null;
  email?: string | null;
  phone: string | null;
  channel: string | null;
  stage: LeadStage;
  message: string | null;
  source: string | null;
  status: string | null;
  lastActivity: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lead domain entity.
 *
 * Invariants enforced here:
 *   - moveToStage() validates the target stage is one of the 6 allowed values.
 *   - isOwnedBy() enforces doctor ownership — used for anti-IDOR checks.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */
export class Lead {
  readonly id: string;
  readonly doctorId: string;
  readonly name: string;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly channel: string | null;
  readonly stage: LeadStage;
  readonly message: string | null;
  readonly source: string | null;
  readonly status: string | null;
  readonly lastActivity: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: LeadCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.name = params.name;
    this.lastName = params.lastName ?? null;
    this.email = params.email ?? null;
    this.phone = params.phone ?? null;
    this.channel = params.channel ?? null;
    this.stage = params.stage;
    this.message = params.message ?? null;
    this.source = params.source ?? null;
    this.status = params.status ?? null;
    this.lastActivity = params.lastActivity ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /** Returns true when the given doctorId owns this lead. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Validates that the target stage is one of the 6 allowed values.
   * Returns a new Lead with the updated stage (immutable pattern).
   * Throws LeadInvalidStageError for unrecognised values.
   */
  moveToStage(newStage: string): Lead {
    if (!VALID_STAGES.includes(newStage as LeadStage)) {
      throw new LeadInvalidStageError(newStage);
    }
    return Lead.create({ ...this.toParams(), stage: newStage as LeadStage, updatedAt: new Date() });
  }

  /** Factory — creates a Lead from raw data. Does not persist. */
  static create(params: LeadCreateParams): Lead {
    return new Lead(params);
  }

  static isValidStage(stage: string): stage is LeadStage {
    return VALID_STAGES.includes(stage as LeadStage);
  }

  private toParams(): LeadCreateParams {
    return {
      id: this.id,
      doctorId: this.doctorId,
      name: this.name,
      lastName: this.lastName,
      email: this.email,
      phone: this.phone,
      channel: this.channel,
      stage: this.stage,
      message: this.message,
      source: this.source,
      status: this.status,
      lastActivity: this.lastActivity,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
