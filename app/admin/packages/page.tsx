// REMOVED 2026-04-22: paquetes son responsabilidad del doctor, no del admin.
// Si necesitas gestionar plantillas de paquetes, usa /doctor/services.
import { redirect } from 'next/navigation'
export default function AdminPackagesPage() {
  redirect('/admin')
}
