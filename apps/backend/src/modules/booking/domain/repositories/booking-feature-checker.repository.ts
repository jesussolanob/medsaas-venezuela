/**
 * Port: IBookingFeatureChecker
 *
 * Determines whether the online booking feature is enabled for a given doctor
 * based on their effective subscription plan. The effective plan takes into
 * account lazy downgrade rules (expired subscription → permanent/free plan).
 *
 * This interface lives in the booking domain so that application use-cases
 * depend on an abstraction, not on the doctor-settings infrastructure.
 */

export const BOOKING_FEATURE_CHECKER = Symbol('IBookingFeatureChecker');

export interface IBookingFeatureChecker {
  /**
   * Returns true when the effective plan of the doctor has the `booking`
   * feature enabled in `plan_features`. Returns false when the doctor does
   * not exist, has no subscription, or their plan does not include booking.
   */
  isBookingEnabled(doctorId: string): Promise<boolean>;
}
