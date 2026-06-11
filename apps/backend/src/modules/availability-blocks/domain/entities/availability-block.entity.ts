/**
 * AvailabilityBlock entity — pure domain logic, no external dependencies.
 *
 * Represents a period during which a doctor is unavailable for bookings.
 * A full-day block spans 00:00–23:59:59 local time (stored as UTC in the DB).
 * A partial-day block covers a specific hour range within a day.
 *
 * Business rule: ends_at must be strictly after starts_at (enforced in create()).
 */
export interface AvailabilityBlockProps {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AvailabilityBlock {
  readonly id: string;
  readonly doctorId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly reason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: AvailabilityBlockProps) {
    this.id = props.id;
    this.doctorId = props.doctorId;
    this.startsAt = props.startsAt;
    this.endsAt = props.endsAt;
    this.reason = props.reason;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Returns true when this block overlaps the given slot time.
   *
   * A slot at HH:MM (represented as a Date) overlaps the block when
   * slotTime >= startsAt && slotTime < endsAt.
   * The end bound is exclusive so that a block ending exactly at slot time
   * does NOT block that slot.
   */
  overlapsSlot(slotTime: Date): boolean {
    return slotTime >= this.startsAt && slotTime < this.endsAt;
  }

  /**
   * Returns true when this block overlaps the interval [rangeStart, rangeEnd).
   * Used to filter relevant blocks for a given day's range query.
   */
  overlapsRange(rangeStart: Date, rangeEnd: Date): boolean {
    return this.startsAt < rangeEnd && this.endsAt > rangeStart;
  }

  /** True when the block covers an entire calendar day (00:00 to next 00:00 or 23:59:59.999). */
  isFullDay(): boolean {
    const startH = this.startsAt.getUTCHours();
    const startM = this.startsAt.getUTCMinutes();
    const endH = this.endsAt.getUTCHours();
    const endM = this.endsAt.getUTCMinutes();
    const endS = this.endsAt.getUTCSeconds();

    const startsAtMidnight = startH === 0 && startM === 0;
    const endsAtDayEnd =
      (endH === 23 && endM === 59 && endS >= 59) || (endH === 0 && endM === 0 && endS === 0);

    return startsAtMidnight && endsAtDayEnd;
  }

  /** Anti-IDOR: returns true when the given actor owns this block. */
  isOwnedBy(actorId: string): boolean {
    return this.doctorId === actorId;
  }

  static create(props: AvailabilityBlockProps): AvailabilityBlock {
    return new AvailabilityBlock(props);
  }
}
