import { redirect } from 'next/navigation'

// Finanzas del admin eliminadas en beta privada — no hay pagos procesados.
// Los reportes financieros son por doctor en /doctor/finances.
export default function AdminFinancesRedirect() {
  redirect('/admin')
}
