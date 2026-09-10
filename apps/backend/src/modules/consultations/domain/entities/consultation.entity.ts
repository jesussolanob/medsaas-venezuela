import type { PaymentStatus } from '@delta/shared-types';
import type { ConsultationExtraItem } from './consultation-extra-item.entity';

/**
 * Datos del pago que cubre esta consulta (sesión 2..N de un paquete).
 *
 * Null cuando la consulta es la primera del paquete (que es la que hizo
 * el pago) o cuando no forma parte de un paquete. Jamás es un invariante
 * de dominio — se rellena en el lado de lectura desde el JOIN con payments.
 */
export interface PaymentCoverage {
  paymentId: string;
  /**
   * Estado del pago del PAQUETE — la verdad sobre si ya se cobró.
   *
   * No se deriva del `payment_status` de esta consulta: las sesiones creadas
   * antes de este lote pueden estar en 'pending' aunque el paquete ya se haya
   * cobrado. Sin este campo la pantalla afirmaba "paquete ya pagado" también
   * cuando el cobro seguía pendiente.
   */
  status: PaymentStatus;
  planName: string | null;
  sessionNumber: number | null;
  totalSessions: number | null;
  amountUsd: number;
  amountBs: number | null;
  paidAt: Date | null;
  method: string | null;
  reference: string | null;
}

/**
 * A single block definition as stored in blocks_structure.
 *
 * Opaque, frontend-managed metadata persisted verbatim as JSONB. Items arrive with
 * inconsistent field naming (camelCase from the doctor's resolved config, snake_case
 * from the add-block catalog), so only `key` is guaranteed. The backend does not
 * interpret the remaining fields — it stores and returns them untouched — hence the
 * index signature instead of a fixed shape. Values for each block live in blocksSnapshot
 * (key→value record).
 */
export interface BlockDefinition {
  key: string;
  [field: string]: unknown;
}

export interface ConsultationCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  appointmentId?: string | null;
  consultationCode: string;
  consultationDate: Date;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod?: string | null;
  amount?: number | null;
  /**
   * The stable base price of the consultation (set once on first approval).
   * `total = base_amount + Σ(extra_items.amount_usd)`.
   * Null until the payment has been approved at least once.
   */
  baseAmount?: number | null;
  paymentDate?: Date | null;
  paymentReference?: string | null;
  paymentReceiptUrl?: string | null;
  blocksSnapshot?: Record<string, unknown> | null;
  /**
   * Per-consultation block structure definitions (array).
   * Stored separately from blocksSnapshot (which holds values).
   * Null until the doctor first saves a structured template for this consultation.
   */
  blocksStructure?: BlockDefinition[] | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Enrichment fields — populated by the list/findById queries via JOIN.
   * Null when the consultation was constructed without JOIN enrichment
   * (e.g. after create/update operations).
   * Not a domain invariant; purely for read-side presentation.
   */
  patientName?: string | null;
  appointmentStatus?: string | null;
  /**
   * Nombre del servicio contratado (appointments.plan_name).
   *
   * Se muestra SIEMPRE, con o sin monto: un consultorio puede tener varios
   * planes y por el importe solo no se distingue cuál contrató el paciente.
   * Null cuando la consulta no tiene cita o la cita no guardó plan.
   */
  planName?: string | null;
  /** Nº de sesión dentro del combo comprado (1-based); null si la cita no es de un paquete. */
  sessionNumber?: number | null;
  /** Total de sesiones del paquete de la cita; null si no hay paquete. */
  packageTotalSessions?: number | null;
  /**
   * Importe cobrado por el paquete completo (lo que se pagó en la primera sesión).
   * Igual en TODAS las sesiones del paquete: no se divide ni se multiplica.
   * Null en consultas sueltas. Read-model: no vive en la tabla.
   */
  packageChargeUsd?: number | null;
  /**
   * Extra service items linked to this consultation.
   * Populated by findById (not by list queries — too expensive).
   * Empty array when there are no extras or when not loaded.
   */
  extraItems?: ConsultationExtraItem[];
  /**
   * Cobertura del pago del paquete — solo no es null para sesiones 2..N.
   * Relleno en el lado de lectura por el JOIN de findById(); null en todos
   * los demás paths de escritura (create, update, approveWithExtras, etc.)
   * hasta que el cliente llame a GET /consultations/:id.
   */
  coveredBy?: PaymentCoverage | null;
}

/**
 * Consultation domain entity.
 *
 * Holds decrypted (plaintext) clinical data in memory — encryption/decryption is
 * the responsibility of the infrastructure layer (SequelizeConsultationRepository).
 *
 * Business invariants enforced here:
 *   - canBeModifiedBy() enforces doctor ownership (anti-IDOR).
 *   - canApprovePayment() prevents double-approval transitions.
 */
export class Consultation {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly appointmentId: string | null;
  readonly consultationCode: string;
  readonly consultationDate: Date;
  readonly chiefComplaint: string | null;
  readonly diagnosis: string | null;
  readonly treatment: string | null;
  readonly notes: string | null;
  readonly paymentStatus: PaymentStatus;
  readonly paymentMethod: string | null;
  readonly amount: number | null;
  /** Stable base price set on first approval. Total = baseAmount + Σ extraItems. */
  readonly baseAmount: number | null;
  readonly paymentDate: Date | null;
  readonly paymentReference: string | null;
  readonly paymentReceiptUrl: string | null;
  readonly blocksSnapshot: Record<string, unknown> | null;
  /** Per-consultation block structure definitions — separate from blocksSnapshot values. */
  readonly blocksStructure: BlockDefinition[] | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Decrypted patient full name — populated by the enriched list/findById query. */
  readonly patientName: string | null;
  /** Status of the linked appointment — populated by the enriched list/findById query. */
  readonly appointmentStatus: string | null;
  /** Servicio contratado (appointments.plan_name) — se muestra siempre, con o sin monto. */
  readonly planName: string | null;
  /**
   * Ubicación de esta consulta dentro de un combo de varias sesiones: "la 2 de 3".
   * Ambos vienen del JOIN (appointments.session_number + patient_packages.total_sessions)
   * y son null cuando la consulta es suelta. Sirven solo para mostrar, no son invariantes.
   */
  readonly sessionNumber: number | null;
  readonly packageTotalSessions: number | null;
  /** Importe del paquete completo — ver PackageChargeUsd en los params. */
  readonly packageChargeUsd: number | null;
  /** Extra service items — populated by findById. Empty array when not loaded. */
  readonly extraItems: ConsultationExtraItem[];
  /**
   * Cobertura del pago del paquete — solo no es null para sesiones 2..N.
   * Relleno en el lado de lectura por el JOIN de findById().
   */
  readonly coveredBy: PaymentCoverage | null;

  constructor(params: ConsultationCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.appointmentId = params.appointmentId ?? null;
    this.consultationCode = params.consultationCode;
    this.consultationDate = params.consultationDate;
    this.chiefComplaint = params.chiefComplaint ?? null;
    this.diagnosis = params.diagnosis ?? null;
    this.treatment = params.treatment ?? null;
    this.notes = params.notes ?? null;
    this.paymentStatus = params.paymentStatus;
    this.paymentMethod = params.paymentMethod ?? null;
    this.amount = params.amount ?? null;
    this.baseAmount = params.baseAmount ?? null;
    this.paymentDate = params.paymentDate ?? null;
    this.paymentReference = params.paymentReference ?? null;
    this.paymentReceiptUrl = params.paymentReceiptUrl ?? null;
    this.blocksSnapshot = params.blocksSnapshot ?? null;
    this.blocksStructure = params.blocksStructure ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.patientName = params.patientName ?? null;
    this.appointmentStatus = params.appointmentStatus ?? null;
    this.planName = params.planName ?? null;
    this.sessionNumber = params.sessionNumber ?? null;
    this.packageTotalSessions = params.packageTotalSessions ?? null;
    this.packageChargeUsd = params.packageChargeUsd ?? null;
    this.extraItems = params.extraItems ?? [];
    this.coveredBy = params.coveredBy ?? null;
  }

  /**
   * Returns true when the given doctor owns this consultation.
   * Used to enforce anti-IDOR on all read and write operations.
   */
  canBeModifiedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns true when the payment transition pending → approved is allowed.
   * A second approval attempt must throw PaymentAlreadyApprovedError.
   */
  canApprovePayment(): boolean {
    return this.paymentStatus === 'pending';
  }

  /** Factory — creates a Consultation from raw (plaintext) data. Does not persist. */
  static create(params: ConsultationCreateParams): Consultation {
    return new Consultation(params);
  }
}
