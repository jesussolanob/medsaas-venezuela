/**
 * DoctorPrompt domain entity.
 *
 * Tracks lifecycle events for prompts shown to doctors (modals, email-triggered
 * flows, etc.). Used by the retention plan to control when and how many times
 * each prompt is shown.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export interface DoctorPromptProps {
  id: string;
  doctorId: string;
  promptKey: string;
  shownCount: number;
  firstShownAt: Date | null;
  lastShownAt: Date | null;
  actedAt: Date | null;
  snoozedUntil: Date | null;
  dismissedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DoctorPrompt {
  readonly id: string;
  readonly doctorId: string;
  readonly promptKey: string;
  readonly shownCount: number;
  readonly firstShownAt: Date | null;
  readonly lastShownAt: Date | null;
  readonly actedAt: Date | null;
  readonly snoozedUntil: Date | null;
  readonly dismissedAt: Date | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: DoctorPromptProps) {
    this.id = props.id;
    this.doctorId = props.doctorId;
    this.promptKey = props.promptKey;
    this.shownCount = props.shownCount;
    this.firstShownAt = props.firstShownAt;
    this.lastShownAt = props.lastShownAt;
    this.actedAt = props.actedAt;
    this.snoozedUntil = props.snoozedUntil;
    this.dismissedAt = props.dismissedAt;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Returns true when the doctor has permanently dismissed this prompt.
   * Once dismissed, the prompt is never shown again.
   */
  isDismissed(): boolean {
    return this.dismissedAt !== null;
  }

  /**
   * Returns true when the prompt is currently snoozed (temporarily hidden).
   * The prompt reappears once snoozedUntil passes.
   */
  isSnoozed(now: Date): boolean {
    return this.snoozedUntil !== null && this.snoozedUntil > now;
  }

  /**
   * Returns true when the doctor has acted on this prompt (e.g. booked a meeting).
   */
  hasActed(): boolean {
    return this.actedAt !== null;
  }

  /**
   * Returns true when the shown count has reached or exceeded maxShows.
   * Phase-4 email rows bypass this check (caller's responsibility).
   */
  hasExceededMaxShows(maxShows: number): boolean {
    return this.shownCount >= maxShows;
  }

  static create(props: DoctorPromptProps): DoctorPrompt {
    return new DoctorPrompt(props);
  }
}
