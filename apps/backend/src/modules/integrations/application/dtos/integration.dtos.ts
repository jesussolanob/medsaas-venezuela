import { z } from 'zod';

// ---------------------------------------------------------------------------
// Connect Google
// ---------------------------------------------------------------------------

export const ConnectGoogleSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
});
export type ConnectGoogleDto = z.infer<typeof ConnectGoogleSchema>;

// ---------------------------------------------------------------------------
// Create Calendar Event with Meet
// ---------------------------------------------------------------------------

export interface CreateCalendarEventInput {
  doctorId: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  /**
   * Patient email — optional.
   * When present, the patient is added as an attendee on the Google Calendar event.
   * When absent, the event is created without attendees (no empty attendee injected).
   */
  attendeeEmail?: string;
}

export interface CalendarEventResult {
  meetLink: string;
  eventId: string;
}

// ---------------------------------------------------------------------------
// Output DTOs
// ---------------------------------------------------------------------------

export interface IntegrationStatusOutput {
  connected: boolean;
  googleEmail?: string;
}
