import { parseMeetingPromptSettings, MEETING_PROMPT_DEFAULTS } from './meeting-prompt-settings';

function makeMap(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe('parseMeetingPromptSettings', () => {
  it('returns all defaults when the map is empty', () => {
    const result = parseMeetingPromptSettings(new Map());
    expect(result).toEqual(MEETING_PROMPT_DEFAULTS);
  });

  it('parses numeric values correctly', () => {
    const result = parseMeetingPromptSettings(
      makeMap({
        meeting_prompt_min_days: '7',
        meeting_prompt_snooze_days: '2',
        meeting_prompt_max_shows: '5',
      }),
    );
    expect(result.minDays).toBe(7);
    expect(result.snoozeDays).toBe(2);
    expect(result.maxShows).toBe(5);
  });

  // Issue 3: NaN guard — bad values must fall back to defaults
  it('falls back to default minDays when value is empty string', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_min_days: '' })).minDays).toBe(
      MEETING_PROMPT_DEFAULTS.minDays,
    );
  });

  it('falls back to default minDays when value is non-numeric', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_min_days: 'abc' })).minDays).toBe(
      MEETING_PROMPT_DEFAULTS.minDays,
    );
  });

  it('falls back to default snoozeDays when value is NaN', () => {
    expect(
      parseMeetingPromptSettings(makeMap({ meeting_prompt_snooze_days: 'NaN' })).snoozeDays,
    ).toBe(MEETING_PROMPT_DEFAULTS.snoozeDays);
  });

  it('falls back to default maxShows when value is a float string', () => {
    // parseInt('1.5') = 1 which IS finite, so we don't test that here.
    // Instead test a pure non-numeric:
    expect(
      parseMeetingPromptSettings(makeMap({ meeting_prompt_max_shows: 'undefined' })).maxShows,
    ).toBe(MEETING_PROMPT_DEFAULTS.maxShows);
  });

  // Bounds
  it('clamps minDays to 0 minimum', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_min_days: '-5' })).minDays).toBe(0);
  });

  it('clamps snoozeDays to minimum of 1', () => {
    expect(
      parseMeetingPromptSettings(makeMap({ meeting_prompt_snooze_days: '0' })).snoozeDays,
    ).toBe(1);
  });

  it('clamps maxShows to minimum of 1', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_max_shows: '-10' })).maxShows).toBe(
      1,
    );
  });

  it('clamps minDays to maximum of 365', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_min_days: '999' })).minDays).toBe(
      365,
    );
  });

  // Kill-switch
  it('enabled=true by default', () => {
    expect(parseMeetingPromptSettings(new Map()).enabled).toBe(true);
  });

  it('enabled=false when setting is the literal string "false"', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_enabled: 'false' })).enabled).toBe(
      false,
    );
  });

  it('enabled=true when setting is "true"', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_enabled: 'true' })).enabled).toBe(
      true,
    );
  });

  it('enabled=true when setting is any non-"false" value', () => {
    expect(parseMeetingPromptSettings(makeMap({ meeting_prompt_enabled: '1' })).enabled).toBe(true);
  });
});
