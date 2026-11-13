import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROMPT_REPOSITORY,
  type IDoctorPromptRepository,
} from '../../domain/repositories/idoctor-prompt.repository';
import type { MeetingPromptStatusOutput } from '@delta/shared-types';
import { parseMeetingPromptSettings } from '../utils/meeting-prompt-settings';

const MEETING_MODAL_KEY = 'meeting_modal';
const EMAIL_INVITE_KEYS = ['email:meeting_invite_pre', 'email:meeting_invite_expired'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * GetMeetingPromptStatusUseCase
 *
 * Evaluates all rules to decide whether the "Queremos conocerte" modal
 * should be shown to the given doctor right now.
 *
 * Rules (in order, any one causes show=false):
 *   1. meeting_prompt_enabled = false (admin kill-switch).
 *   2. Doctor has a scheduled or completed team meeting.
 *   3. Doctor dismissed the modal ("No me interesa").
 *   4. Doctor has a pending contact request (don't interrupt them).
 *   5. Doctor's account is younger than meeting_prompt_min_days.
 *   6. Doctor's prompt row is currently snoozed.
 *   7. Doctor has reached meeting_prompt_max_shows AND no phase-4 email rows.
 */
@Injectable()
export class GetMeetingPromptStatusUseCase {
  constructor(
    @Inject(DOCTOR_PROMPT_REPOSITORY)
    private readonly repo: IDoctorPromptRepository,
  ) {}

  async execute(doctorId: string): Promise<MeetingPromptStatusOutput> {
    const now = new Date();

    // Load settings and prompt state in parallel for performance
    const [settings, prompt, hasEmailPrompt, hasScheduledMeeting, hasPendingContact, createdAt] =
      await Promise.all([
        this.repo.getSettings([
          'meeting_prompt_enabled',
          'meeting_prompt_min_days',
          'meeting_prompt_max_shows',
        ]),
        this.repo.findByDoctorAndKey(doctorId, MEETING_MODAL_KEY),
        this.repo.hasPhase4EmailPrompt(doctorId),
        this.repo.hasScheduledOrDoneTeamMeeting(doctorId),
        this.repo.hasPendingContactRequest(doctorId),
        this.repo.getDoctorCreatedAt(doctorId),
      ]);

    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));
    const parsed = parseMeetingPromptSettings(settingsMap);

    // Rule 1: kill-switch
    if (!parsed.enabled) return { show: false, source: null };

    // Rule 2: doctor already has a meeting (scheduled or done)
    if (hasScheduledMeeting) return { show: false, source: null };

    // Rule 3: dismissed permanently
    if (prompt?.isDismissed()) return { show: false, source: null };

    // Rule 4: pending contact request
    if (hasPendingContact) return { show: false, source: null };

    // Rule 5: account too young
    if (createdAt !== null) {
      const daysSinceCreation = (now.getTime() - createdAt.getTime()) / MS_PER_DAY;
      if (daysSinceCreation < parsed.minDays) return { show: false, source: null };
    }

    // Rule 6: snoozed
    if (prompt?.isSnoozed(now)) return { show: false, source: null };

    // Rule 7: max shows (bypassed when phase-4 email rows exist)
    if (!hasEmailPrompt) {
      if (prompt?.hasExceededMaxShows(parsed.maxShows)) return { show: false, source: null };
    }

    // Determine source
    const emailKeyLookups = await Promise.all(
      EMAIL_INVITE_KEYS.map((k) => this.repo.findByDoctorAndKey(doctorId, k)),
    );
    const hasEmailSource = emailKeyLookups.some((r) => r !== null);

    return {
      show: true,
      source: hasEmailSource ? 'email' : 'modal',
    };
  }
}
