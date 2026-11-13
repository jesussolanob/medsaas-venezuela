/**
 * Links used in team-meeting emails.
 *
 * The backend deploys set APP_BASE_URL (staging and prod workflows), not
 * FRONTEND_URL; the emails used FRONTEND_URL with an `app.deltasalud.app`
 * fallback that does not exist. Same resolution as the registration emails:
 * APP_BASE_URL → FRONTEND_URL → https://deltasalud.app.
 */
function appBaseUrl(): string {
  const configured = (process.env['APP_BASE_URL'] ?? process.env['FRONTEND_URL'] ?? '').replace(
    /\/+$/,
    '',
  );
  return /^https?:\/\//i.test(configured) ? configured : 'https://deltasalud.app';
}

/** Doctor's home: the upcoming-meeting card (reschedule / cancel) lives there. */
export function doctorMeetingUrl(): string {
  return `${appBaseUrl()}/doctor`;
}

/** Admin → Reuniones. */
export function adminMeetingsUrl(): string {
  return `${appBaseUrl()}/admin/team-meetings`;
}
