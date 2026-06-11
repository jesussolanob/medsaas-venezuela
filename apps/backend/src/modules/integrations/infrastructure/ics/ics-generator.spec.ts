import { generateIcsEvent } from './ics-generator';

const baseParams = {
  appointmentId: 'appt-123',
  summary: 'Consulta con Dr. Pérez',
  startISO: '2026-07-01T10:00:00Z',
  endISO: '2026-07-01T10:30:00Z',
  organizerName: 'Dr. Pérez',
  attendeeEmail: 'patient@example.com',
};

describe('generateIcsEvent', () => {
  it('generates a valid VCALENDAR wrapper', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('sets the UID using the appointmentId', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics).toContain('UID:delta-appt-123@delta.medical');
  });

  it('includes DTSTART and DTEND in UTC format', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics).toContain('DTSTART:20260701T100000Z');
    expect(ics).toContain('DTEND:20260701T103000Z');
  });

  it('includes the attendee email', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics).toContain('patient@example.com');
  });

  it('uses meetLink as LOCATION when provided', () => {
    const ics = generateIcsEvent({
      ...baseParams,
      meetLink: 'https://meet.google.com/abc-defg-hij',
    });
    expect(ics).toContain('LOCATION:https://meet.google.com/abc-defg-hij');
    expect(ics).toContain(
      'DESCRIPTION:Enlace de videollamada: https://meet.google.com/abc-defg-hij',
    );
  });

  it('uses Jitsi link as LOCATION when meetLink is a Jitsi URL', () => {
    const jitsiLink = 'https://meet.jit.si/delta-appt-123';
    const ics = generateIcsEvent({ ...baseParams, meetLink: jitsiLink });
    expect(ics).toContain(`LOCATION:${jitsiLink}`);
  });

  it('uses officeAddress as LOCATION for in-person appointments', () => {
    const ics = generateIcsEvent({
      ...baseParams,
      officeAddress: 'Av. Principal 123, Caracas',
    });
    expect(ics).toContain('LOCATION:Av. Principal 123\\, Caracas');
  });

  it('does not include LOCATION when neither meetLink nor officeAddress is provided', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics).not.toContain('LOCATION:');
  });

  it('escapes special characters in summary', () => {
    const ics = generateIcsEvent({ ...baseParams, summary: 'Cita, sala B; urgente' });
    expect(ics).toContain('SUMMARY:Cita\\, sala B\\; urgente');
  });

  it('includes organizer email when provided', () => {
    const ics = generateIcsEvent({ ...baseParams, organizerEmail: 'doc@gmail.com' });
    expect(ics).toContain('mailto:doc@gmail.com');
  });

  it('falls back to noreply organizer when organizerEmail is not provided', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics).toContain('mailto:noreply@delta.medical');
  });

  it('ends with a CRLF as required by RFC 5545', () => {
    const ics = generateIcsEvent(baseParams);
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('strips CR/LF injection attempts from attendee email', () => {
    const ics = generateIcsEvent({
      ...baseParams,
      attendeeEmail: 'patient@example.com\r\nINJECTED:header',
    });
    expect(ics).not.toContain('INJECTED:header');
  });

  it('strips CR/LF injection attempts from organizer email', () => {
    const ics = generateIcsEvent({
      ...baseParams,
      organizerEmail: 'doc@gmail.com\r\nX-INJECT:evil',
    });
    expect(ics).not.toContain('X-INJECT:evil');
  });
});
