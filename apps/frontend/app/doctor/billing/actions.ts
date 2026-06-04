'use server';

/**
 * app/doctor/billing/actions.ts
 *
 * Server Actions for the billing (recibos/presupuestos) page.
 * ETAPA 1 — thin-proxy al backend NestJS (BFF). Reemplaza las lecturas directas a
 * Supabase (profiles, consultations+patients, pricing_plans, billing_documents).
 *
 * Backend:
 *   GET /api/consultations/with-patient → consultas del doctor con patient_name descifrado
 *   GET /api/doctor/profile             → perfil (avatar_url → logo_url)
 *   GET /api/doctor/services            → pricing_plans (servicios)
 *   GET /api/doctor/billing             → billing_documents (para stats)
 *
 * GAP backend (Fase 5/mejora): los servicios no tienen `description`. DEFERRED Fase 5:
 * PDF del recibo, email, storage de comprobantes.
 */

import { backendGet } from '@/lib/api-client.server';
import { getDoctorProfile, getDoctorServices } from '@/app/doctor/actions';

export interface BillingConsultation {
  id: string;
  consultation_code: string;
  consultation_date: string;
  patient_name: string;
  patient_phone: string | null;
  patient_email: string | null;
}

export interface BillingProfile {
  full_name: string;
  specialty: string;
  phone: string;
  email: string;
  logo_url: string | null;
  professional_title: string | null;
}

export interface BillingService {
  id: string;
  name: string;
  price_usd: number;
  description: string;
  is_active: boolean;
}

export interface BillingStats {
  facturas: number;
  recibos: number;
  presupuestos: number;
  totalFacturas: number;
  totalRecibos: number;
  totalPresupuestos: number;
}

/** The doctor's consultations enriched with decrypted patient name/phone/email. */
export async function getBillingConsultations(): Promise<BillingConsultation[]> {
  const result = await backendGet<BillingConsultation[]>(
    '/api/consultations/with-patient?limit=100',
  );
  return result.ok && Array.isArray(result.value) ? result.value : [];
}

/** The doctor's profile in the shape the billing header expects (avatar_url → logo_url). */
export async function getBillingProfile(): Promise<BillingProfile | null> {
  const p = await getDoctorProfile();
  if (!p) return null;
  return {
    full_name: p.full_name,
    specialty: p.specialty ?? '',
    phone: p.phone ?? '',
    email: p.email,
    logo_url: p.avatar_url,
    professional_title: p.professional_title,
  };
}

/** Active services (pricing_plans) for the add-item picker. */
export async function getBillingServices(): Promise<BillingService[]> {
  const svcs = await getDoctorServices();
  return svcs
    .filter((s) => s.is_active)
    .map((s) => ({
      id: s.id,
      name: s.name,
      price_usd: s.price_usd,
      description: '', // GAP: backend service has no description field
      is_active: s.is_active,
    }));
}

interface BackendBillingDoc {
  docType: string;
  total: number | null;
}

/** Aggregate billing_documents into the dashboard stats the page renders. */
export async function getBillingStats(): Promise<BillingStats> {
  const result = await backendGet<BackendBillingDoc[]>('/api/doctor/billing?limit=100');
  const docs = result.ok && Array.isArray(result.value) ? result.value : [];

  const sumBy = (type: string) =>
    docs.filter((d) => d.docType === type).reduce((s, d) => s + (d.total || 0), 0);
  const countBy = (type: string) => docs.filter((d) => d.docType === type).length;

  return {
    facturas: countBy('factura'),
    recibos: countBy('recibo'),
    presupuestos: countBy('presupuesto'),
    totalFacturas: sumBy('factura'),
    totalRecibos: sumBy('recibo'),
    totalPresupuestos: sumBy('presupuesto'),
  };
}
