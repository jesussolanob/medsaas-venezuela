import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { CalendarEventResult } from '../../application/dtos/integration.dtos';

/** Minutes before appointment start at which Google Calendar sends reminders. */
const REMINDER_MINUTES_BEFORE = 30;

export interface ExchangeCodeResult {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date | null;
  scope: string | null;
  googleEmail: string | null;
}

export interface RefreshTokenResult {
  accessToken: string;
  /** New refresh token — may be undefined if Google did not rotate it. */
  refreshToken?: string;
  tokenExpiry: Date | null;
}

export interface CreateEventInput {
  accessToken: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  attendeeEmail: string;
}

/**
 * GoogleCalendarService — infrastructure adapter for Google Calendar + Meet API.
 *
 * ENV-GATED: if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set,
 * isConfigured() returns false and all API methods throw.
 *
 * Use isConfigured() before calling any method — callers in use-cases
 * gate on this flag and fall back to Jitsi + .ics when false.
 *
 * SECURITY:
 *   - NEVER log access_token, refresh_token, or attendee email.
 *   - All Google API calls use the doctor's own credentials — events are
 *     created in the doctor's calendar, not a shared service account.
 */
@Injectable()
export class GoogleCalendarService implements OnModuleInit {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private clientId: string | null = null;
  private clientSecret: string | null = null;
  // Assigned in onModuleInit from GOOGLE_REDIRECT_URI env var.
  private redirectUri!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.clientId = this.config.get<string>('GOOGLE_CLIENT_ID') ?? null;
    this.clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? null;
    this.redirectUri =
      this.config.get<string>('GOOGLE_REDIRECT_URI') ??
      'http://localhost:3000/api/integrations/google/callback';

    if (this.clientId && this.clientSecret) {
      this.logger.log('[google-calendar] configured — real API calls enabled');
    } else {
      this.logger.warn('[google-calendar] GOOGLE_CLIENT_ID/SECRET not set — fallback mode only');
    }
  }

  /** Returns true when the Google OAuth env vars are present. */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Generates the Google OAuth2 authorization URL.
   * Used by the frontend to redirect the doctor to Google's consent screen.
   */
  getAuthUrl(): string {
    const oauth2Client = this.buildOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
  }

  /**
   * Exchanges a one-time authorization code for access + refresh tokens.
   * Fetches the doctor's Google email via the userinfo endpoint.
   */
  async exchangeCode(code: string): Promise<ExchangeCodeResult> {
    this.assertConfigured();
    const oauth2Client = this.buildOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    const accessToken = tokens.access_token ?? '';
    const refreshToken = tokens.refresh_token ?? '';
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    const scope = tokens.scope ?? null;

    // Fetch the Google email for display purposes
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    let googleEmail: string | null = null;
    try {
      const { data } = await oauth2.userinfo.get();
      googleEmail = data.email ?? null;
    } catch {
      // Non-fatal — email is informational only
      this.logger.warn('[google-calendar] could not fetch userinfo after code exchange');
    }

    return { accessToken, refreshToken, tokenExpiry, scope, googleEmail };
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<RefreshTokenResult> {
    this.assertConfigured();
    const oauth2Client = this.buildOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token ?? '',
      refreshToken: credentials.refresh_token ?? undefined,
      tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    };
  }

  /**
   * Creates a Google Calendar event with a Meet conferencing link and invites
   * the patient as an attendee.
   *
   * Returns the Meet link and Google Calendar event ID.
   */
  async createEventWithMeet(input: CreateEventInput): Promise<CalendarEventResult> {
    this.assertConfigured();
    const oauth2Client = this.buildOAuth2Client();
    oauth2Client.setCredentials({ access_token: input.accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const requestId = `delta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data } = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startISO, timeZone: 'UTC' },
        end: { dateTime: input.endISO, timeZone: 'UTC' },
        attendees: [{ email: input.attendeeEmail }],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: REMINDER_MINUTES_BEFORE },
            { method: 'email', minutes: REMINDER_MINUTES_BEFORE },
          ],
        },
      },
    });

    const meetLink =
      data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ??
      data.hangoutLink ??
      '';

    return {
      meetLink,
      eventId: data.id ?? '',
    };
  }

  /**
   * Deletes a Google Calendar event (e.g. on appointment cancellation).
   */
  async cancelEvent(accessToken: string, eventId: string): Promise<void> {
    this.assertConfigured();
    const oauth2Client = this.buildOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildOAuth2Client() {
    return new google.auth.OAuth2(this.clientId!, this.clientSecret!, this.redirectUri);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('GoogleCalendarService: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set');
    }
  }
}
