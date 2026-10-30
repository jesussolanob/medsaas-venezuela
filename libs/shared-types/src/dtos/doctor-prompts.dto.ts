import { z } from 'zod';

/**
 * DTOs for the doctor-prompts module (Phase 3 — retention plan).
 *
 * prompt_key values:
 *   'meeting_modal'           — the "Queremos conocerte" modal (phase 3)
 *   'email:meeting_invite_pre'   — sent when trial has 7 days left (phase 4)
 *   'email:meeting_invite_expired' — sent when trial expired (phase 4)
 */

export const MEETING_MODAL_KEY = 'meeting_modal' as const;

/**
 * Response shape for GET /api/doctor/prompts/meeting
 */
export interface MeetingPromptStatusOutput {
  /** Whether the modal should be shown to this doctor right now. */
  show: boolean;
  /**
   * How the doctor arrived at this check.
   * 'email'  — has a phase-4 email prompt row (max-shows rule bypassed).
   * 'modal'  — normal modal flow.
   * null     — show is false.
   */
  source: 'email' | 'modal' | null;
}

/**
 * Input DTO for POST /api/doctor/prompts/meeting/snooze
 * (no body needed — snooze duration comes from app_settings)
 */
export const SnoozePromptDtoSchema = z.object({}).strict();
export type SnoozePromptDto = z.infer<typeof SnoozePromptDtoSchema>;
