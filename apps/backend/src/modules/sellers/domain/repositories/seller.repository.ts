/**
 * ISellerRepository — domain contract for seller-related persistence.
 *
 * All methods operate on the `profiles` table. Sellers are regular profile
 * rows with role = 'seller'. The two new columns they own are:
 *   - seller_code  — the short alphanumeric code the seller shares publicly.
 *   - sold_by      — FK on the specialist's profile pointing at the seller.
 *
 * No PII is accepted as input for logging. Implementations must never log
 * fullName, email, cedula, phone, or any patient-level field.
 */

export const SELLER_REPOSITORY = Symbol('ISellerRepository');

// ---------------------------------------------------------------------------
// Value objects / read models
// ---------------------------------------------------------------------------

/** Minimal seller profile returned to callers. No contact PII beyond fullName. */
export interface SellerProfile {
  id: string;
  /** PII — full name. Seller portal context only. Do NOT log. */
  fullName: string;
  sellerCode: string;
  createdAt: Date;
}

/**
 * A seller's payment-method configuration.
 *
 * Stored as JSONB on `profiles.payment_details` — same column and shape used
 * by specialists (see ADR-044). The JSONB value may be an object or a list per
 * method key; callers normalise it via the shared frontend helpers.
 *
 * SECURITY: this is financial data — never log it.
 */
export interface SellerPaymentDetails {
  sellerId: string;
  /** Raw JSONB — shape mirrors profiles.payment_details used by specialists. */
  paymentDetails: Record<string, unknown>;
}

/**
 * Vendedor como lo ve el super administrador en `/admin/sellers`.
 *
 * A diferencia de `SellerProfile` acá SÍ va el correo: el super admin gestiona
 * esas cuentas y necesita identificarlas. No es PII de paciente, pero igual
 * NUNCA se loguea.
 */
export interface SellerAdminRow {
  id: string;
  /** PII — nunca loguear. */
  fullName: string;
  /** PII — nunca loguear. */
  email: string;
  sellerCode: string;
  /** Cuántos especialistas dio de alta este vendedor. */
  specialistsCount: number;
  /** false = vendedor deshabilitado (is_active = false en profiles). */
  isActive: boolean;
  createdAt: Date;
  /** Null si el vendedor nunca entró. */
  lastSignInAt: Date | null;
}

/**
 * Seller attribution info for a specialist.
 *
 * Returned to super_admin so the assign-seller flow can show a
 * reconfirmation modal ("you're moving this specialist from X to Y")
 * before overwriting an existing sold_by.
 *
 * SECURITY: sellerName is PII — never log it.
 */
export interface SpecialistSellerAssignment {
  specialistId: string;
  /** null when the specialist has no current seller attribution. */
  sellerId: string | null;
  /** PII — seller full name. Do NOT log. null when unattributed. */
  sellerName: string | null;
  /**
   * How the current attribution was established:
   *   'code'         = typed a seller code during self-onboarding.
   *   'admin'        = admin assigned them by hand.
   *   'seller_manual'= seller created the account from their portal.
   *   null           = not attributed to any seller.
   */
  soldBySource: string | null;
}

/**
 * Specialist row as seen from the seller portal.
 *
 * El vendedor necesita poder contactar e identificar al especialista que vendió
 * ("para su posterior consulta"). Son datos del ESPECIALISTA, no de pacientes,
 * y el vendedor es personal de Delta — pero NINGUNO se loguea.
 *
 * A propósito NO incluye MPPS ni colegiado (decisión del dueño, 2026-08-17):
 * son datos de habilitación profesional que le sirven a la verificación de
 * admin, no al seguimiento comercial del vendedor.
 */
export interface SellerSpecialistRow {
  id: string;
  /** PII — full name. Seller portal context only. Do NOT log. */
  fullName: string;
  /** PII — contacto. Do NOT log. */
  email: string;
  /** PII — contacto. Do NOT log. Obligatorio en el alta desde 2026-08-17. */
  phone: string | null;
  /** PII — identidad. Do NOT log. */
  cedula: string | null;
  /** Anotaciones libres del vendedor. Texto del usuario — do NOT log. */
  sellerNotes: string | null;
  /** false = cuenta dada de baja o desactivada por un admin. */
  isActive: boolean;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: Date;
  /** Null when the specialist has never logged in. */
  lastSignInAt: Date | null;
  /**
   * true = el especialista completó el alta (tiene consultorio + servicio activos).
   * false = se registró pero nunca terminó el onboarding.
   *
   * El vendedor necesita este flag para distinguir "cuenta activa" de
   * "usuario a la mitad del proceso" y hacer el seguimiento comercial.
   * La columna ya existe en `profiles` desde la migración 20260617000004.
   */
  onboardingCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface CreateSellerParams {
  id: string;
  fullName: string;
  email: string;
  /** Generated by the use case — never comes from the client. */
  sellerCode: string;
}

export interface CreateSoldSpecialistParams {
  id: string;
  fullName: string;
  email: string;
  specialty?: string | null;
  cedula?: string | null;
  phone?: string | null;
  /** Always 'free_trial'. Sellers cannot assign paid plans. */
  plan: 'free_trial';
  /** Profile id of the authenticated seller — from session, never from request body. */
  soldBy: string;
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ISellerRepository {
  /**
   * Creates a new seller profile (role = 'seller') with the given seller_code.
   * Throws DoctorEmailConflictError (409) when the email is already registered.
   */
  createSeller(params: CreateSellerParams): Promise<SellerProfile>;

  /**
   * Returns the seller profile for the given id, or null when not found.
   * Used by GET /api/seller/me so a seller can read their own code.
   */
  findById(id: string): Promise<SellerProfile | null>;

  /**
   * Lista TODOS los vendedores para el panel del super administrador,
   * con cuántos especialistas dio de alta cada uno. Más recientes primero.
   */
  listSellers(): Promise<SellerAdminRow[]>;

  /**
   * Returns the seller profile whose seller_code matches the given code, or
   * null when no match is found. Used for code validation and onboarding linking.
   */
  findByCode(code: string): Promise<SellerProfile | null>;

  /**
   * Checks whether a given seller_code string is already taken.
   * Used during code generation to retry on collision.
   */
  codeExists(code: string): Promise<boolean>;

  /**
   * Returns all specialist profiles where sold_by = sellerId.
   * Empty array when the seller has not yet onboarded any specialist.
   */
  listSoldSpecialists(sellerId: string): Promise<SellerSpecialistRow[]>;

  /**
   * Returns a single specialist profile by id, only when that specialist was
   * sold by the given seller. Returns null otherwise (anti-IDOR).
   */
  findSoldSpecialist(sellerId: string, specialistId: string): Promise<SellerSpecialistRow | null>;

  /**
   * Actualiza el teléfono y/o las notas de un especialista de la cartera del
   * vendedor. Devuelve la fila actualizada, o null si el especialista no existe
   * o es de otro vendedor (anti-IDOR: el WHERE filtra por sold_by).
   *
   * ⚠️ Solo esos dos campos. El vendedor NO puede tocar plan, rol, correo ni
   * estado de la cuenta desde acá: un update genérico sobre `profiles` desde el
   * portal del vendedor sería una escalada de privilegios.
   *
   * `undefined` = no tocar ese campo. `null` = borrarlo.
   */
  updateSoldSpecialistContact(
    sellerId: string,
    specialistId: string,
    patch: { phone?: string | null; sellerNotes?: string | null },
  ): Promise<SellerSpecialistRow | null>;

  /**
   * Creates a specialist profile + subscription with sold_by = sellerId.
   * Plan is always 'free_trial' — sellers cannot assign paid plans.
   * Throws DoctorEmailConflictError (409) on email collision.
   */
  createSoldSpecialist(params: CreateSoldSpecialistParams): Promise<SellerSpecialistRow>;

  /**
   * Writes sold_by on a specialist profile, but ONLY when it is currently null.
   * If sold_by is already set, this is a no-op — attribution is immutable once
   * established.
   *
   * This one-write guarantee prevents a second seller_code (e.g. submitted on a
   * re-visit to the onboarding wizard) from overwriting the original attribution.
   */
  linkSoldBy(specialistId: string, sellerId: string): Promise<void>;

  /**
   * Returns the payment_details JSONB for the given seller profile.
   * Returns null when no profile with role='seller' and the given id exists.
   *
   * SECURITY: returned data is financial — never log it.
   */
  getSellerPaymentDetails(sellerId: string): Promise<SellerPaymentDetails | null>;

  /**
   * Overwrites payment_details for the given seller profile.
   * Throws SellerNotFoundError (404) when the profile does not exist.
   *
   * SECURITY: details are financial data — never log them.
   */
  updateSellerPaymentDetails(
    sellerId: string,
    details: Record<string, unknown>,
  ): Promise<SellerPaymentDetails>;

  /**
   * Returns the current seller attribution for the given specialist profile.
   * Returns null when no profile with the given id exists.
   *
   * When the specialist exists but has no seller (sold_by IS NULL), returns
   * the struct with sellerId, sellerName, and soldBySource all set to null.
   *
   * Used by the admin assign-seller flow to show a reconfirmation modal
   * before overwriting an existing attribution.
   *
   * SECURITY: sellerName is PII — never log it.
   */
  getSpecialistSellerAssignment(specialistId: string): Promise<SpecialistSellerAssignment | null>;

  /**
   * Immediately deactivates the seller's own account.
   *
   * Sets is_active = false with deactivated_by = 'self', deactivated_at = now(),
   * and stores the optional reason. All commissions, specialists, and attribution
   * rows remain intact for auditability. A super_admin can reactivate the account
   * via the existing toggle in /admin/sellers.
   *
   * SECURITY: reason is free text from the account owner about themselves — no
   * patient PII. Do not log the reason.
   */
  deactivateOwnAccount(sellerId: string, reason: string | null): Promise<void>;
}
