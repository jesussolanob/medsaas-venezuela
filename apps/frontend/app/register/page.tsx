import { redirect } from 'next/navigation';

/**
 * /register — legacy Supabase-era signup (email + password) is retired.
 * With Auth0, registration IS login: a new Google/Auth0 account is onboarded as
 * a doctor on first sign-in, then completes /doctor/onboarding. Redirect to login.
 */
export default function RegisterPage() {
  redirect('/login');
}
