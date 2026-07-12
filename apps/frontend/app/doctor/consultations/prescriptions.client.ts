/**
 * app/doctor/consultations/prescriptions.client.ts
 *
 * Cliente del sub-módulo de recetas — reemplaza a `actions-prescriptions.ts`.
 *
 * Antes el guardado de recetas usaba Server Actions; sus IDs se rehashean en
 * cada build, por lo que una pestaña abierta con el build anterior lanzaba
 * "Server Action not found" tras un deploy. Estas funciones llaman al route
 * handler `/api/doctor/prescriptions` (URL estable) vía fetch, sobreviviendo a
 * los deploys. Mismas firmas que las antiguas actions para no tocar el resto.
 */

export type Prescription = {
  id: string;
  doctor_id: string;
  patient_id: string;
  consultation_id: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  presentation: string | null;
  issued_date: string;
  created_at: string;
  updated_at: string;
};

export type PrescriptionActionResult =
  | { success: true; prescription: Prescription }
  | { success: false; error: string };

/** Fetch all prescriptions for a patient owned by the authenticated doctor. */
export async function getPatientPrescriptions(patientId: string): Promise<Prescription[]> {
  try {
    const res = await fetch(
      `/api/doctor/prescriptions?patientId=${encodeURIComponent(patientId)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { success?: boolean; data?: Prescription[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

/**
 * Emit a new prescription for a patient.
 * doctor_id is derived server-side from the identity header (anti-IDOR).
 */
export async function createPrescription(input: {
  patient_id: string;
  consultation_id?: string | null;
  medication: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  notes?: string | null;
  presentation?: string | null;
}): Promise<PrescriptionActionResult> {
  try {
    const res = await fetch('/api/doctor/prescriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: Prescription;
      error?: string;
    } | null;
    if (!res.ok || !json?.data) {
      return { success: false, error: json?.error ?? `Error ${res.status}` };
    }
    return { success: true, prescription: json.data };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error de red',
    };
  }
}
