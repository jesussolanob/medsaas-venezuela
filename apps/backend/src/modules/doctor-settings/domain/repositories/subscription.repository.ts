import type { SubscriptionInfoParams } from '../value-objects/subscription-info.vo';

export const SUBSCRIPTION_REPOSITORY = Symbol('ISubscriptionRepository');

export interface ISubscriptionRepository {
  /** Find the doctor's active subscription. Returns null when not found. */
  findByDoctorId(doctorId: string): Promise<SubscriptionInfoParams | null>;
}
