/**
 * Human-readable labels for plan keys and feature keys used in the help assistant
 * plan-awareness context block.
 *
 * These are presentation-only constants — no business logic lives here.
 */

/** Maps plan_key → human-readable plan name in Spanish. */
export const PLAN_LABELS: Record<string, string> = {
  // Onboarding trial: temporary full access (Plus-level features) before the
  // plan resolves to Delta Free. Doctors on it see the same modules as Plus.
  free_trial: 'Prueba gratuita (acceso completo temporal)',
  delta_free: 'Delta Free',
  delta_base: 'Delta Base',
  delta_plus: 'Delta Plus',
};

/**
 * Maps featureKey → UI label in Spanish.
 *
 * Any key not present here falls back to the raw key string at call site.
 */
export const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Inicio (Panel)',
  agenda: 'Agenda',
  patients: 'Pacientes',
  consultations: 'Consultas',
  ehr: 'Historia clínica (EHR)',
  finances: 'Finanzas',
  billing: 'Facturación',
  reports: 'Reportes',
  crm: 'CRM / Leads',
  reminders: 'Recordatorios',
  messages: 'Mensajes',
  invitations: 'Invitaciones',
  settings: 'Configuración',
  booking: 'Reservas en línea (booking público)',
  ai_assistant: 'Asistente de IA',
  ai_transcription: 'Transcripción con IA',
  ai_reports: 'Resúmenes con IA',
};

/**
 * Returns the human-readable label for a plan key.
 * Falls back to the raw key if no label is configured.
 */
export function getPlanLabel(planKey: string): string {
  return PLAN_LABELS[planKey] ?? planKey;
}

/**
 * Returns the human-readable label for a feature key.
 * Falls back to the raw key if no label is configured.
 */
export function getFeatureLabel(featureKey: string): string {
  return FEATURE_LABELS[featureKey] ?? featureKey;
}
