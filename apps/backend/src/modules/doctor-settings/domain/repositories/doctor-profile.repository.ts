import type { DoctorProfile, DoctorProfileUpdateParams } from '../entities/doctor-profile.entity';

/** Estado de plan usado para decidir el tipo de baja. */
export interface DoctorPlanSnapshot {
  plan: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: Date | null;
}

export const DOCTOR_PROFILE_REPOSITORY = Symbol('IDoctorProfileRepository');

export interface ExchangeRateUpdateParams {
  currencyMode: string;
  customRate: number | null;
  customRateLabel: string | null;
}

export interface IDoctorProfileRepository {
  /** Find the doctor's own profile by their user id. Returns null when not found. */
  findByDoctorId(doctorId: string): Promise<DoctorProfile | null>;

  /** Persist updated profile fields. Returns the updated domain entity. */
  update(doctorId: string, params: DoctorProfileUpdateParams): Promise<DoctorProfile>;

  /** Persist the doctor's exchange-rate preference. Returns the updated domain entity. */
  updateExchangeRate(doctorId: string, params: ExchangeRateUpdateParams): Promise<DoctorProfile>;

  /**
   * Sets onboarding_completed_at to NOW() for the given doctor.
   * Idempotent: safe to call multiple times.
   */
  markOnboardingCompleted(doctorId: string): Promise<void>;

  /**
   * Persists the consultation_blocks_layout for the given doctor.
   */
  updateBlocksLayout(doctorId: string, layout: 'tabs' | 'vertical'): Promise<void>;

  /**
   * Counts appointments booked after `now` that still expect the doctor to show
   * up. Cancelled, completed and no-show appointments are excluded — they owe
   * the patient nothing.
   *
   * Used to block self-deactivation while patients are still waiting.
   */
  countUpcomingAppointments(doctorId: string): Promise<number>;

  /**
   * Switches the account off on the owner's request: is_active = false plus the
   * provenance columns stamped with 'self'.
   *
   * Deliberately NOT a delete — every row the specialist produced stays exactly
   * where it is, and a super_admin can switch the account back on.
   */
  deactivateOwnAccount(doctorId: string, reason: string | null): Promise<void>;

  /**
   * Plan vigente del especialista, para decidir si la baja es inmediata o si
   * hay que respetarle los días que ya pagó.
   */
  findPlanSnapshot(doctorId: string): Promise<DoctorPlanSnapshot | null>;

  /**
   * Baja PROGRAMADA: deja la cuenta encendida y el plan como está, pero anota
   * que el dueño se dio de baja. El barrido la apaga el día del vencimiento.
   */
  scheduleOwnAccountDeactivation(doctorId: string, reason: string | null): Promise<void>;

  /**
   * Apaga las cuentas con baja programada cuyo plan ya venció y las deja en el
   * plan gratuito. Devuelve cuántas apagó.
   */
  applyExpiredScheduledDeactivations(freePlanKey: string): Promise<number>;
}
