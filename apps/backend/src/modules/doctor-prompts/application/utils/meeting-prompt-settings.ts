/**
 * Shared parser for meeting_prompt_* app_settings.
 *
 * Converts raw string values from app_settings into typed, bounded numbers.
 * Any value that is missing, non-numeric, or out of bounds falls back to the
 * corresponding default so the system never operates on NaN.
 *
 * Defaults:
 *   enabled   = true
 *   minDays   = 3    (account must be ≥ 3 days old)
 *   snoozeDays = 1   (snooze for 1 day after "Ahora no")
 *   maxShows  = 3    (show the modal at most 3 times without phase-4 email)
 */
export interface MeetingPromptSettings {
  enabled: boolean;
  minDays: number;
  snoozeDays: number;
  maxShows: number;
}

export const MEETING_PROMPT_DEFAULTS: MeetingPromptSettings = {
  enabled: true,
  minDays: 3,
  snoozeDays: 1,
  maxShows: 3,
};

/**
 * Parses a raw string value to an integer within [min, max].
 * Returns `fallback` when the value is absent, empty, or not a finite integer.
 */
function parseBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * Parses all `meeting_prompt_*` settings from a pre-built map of app_settings.
 * The map key is the full setting key (e.g. 'meeting_prompt_min_days').
 */
export function parseMeetingPromptSettings(
  settingsMap: Map<string, string>,
): MeetingPromptSettings {
  return {
    // Kill-switch: any value other than the literal string 'false' means enabled.
    enabled: settingsMap.get('meeting_prompt_enabled') !== 'false',
    // 0 ≤ minDays ≤ 365 (0 = always eligible regardless of account age)
    minDays: parseBounded(
      settingsMap.get('meeting_prompt_min_days'),
      MEETING_PROMPT_DEFAULTS.minDays,
      0,
      365,
    ),
    // 1 ≤ snoozeDays ≤ 365 (minimum 1 day — "Ahora no" must defer at least 1 day)
    snoozeDays: parseBounded(
      settingsMap.get('meeting_prompt_snooze_days'),
      MEETING_PROMPT_DEFAULTS.snoozeDays,
      1,
      365,
    ),
    // 1 ≤ maxShows ≤ 100
    maxShows: parseBounded(
      settingsMap.get('meeting_prompt_max_shows'),
      MEETING_PROMPT_DEFAULTS.maxShows,
      1,
      100,
    ),
  };
}
