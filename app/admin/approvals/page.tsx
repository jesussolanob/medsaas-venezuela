import { redirect } from 'next/navigation'

// Flujo de aprobaciones eliminado en beta privada.
// Los médicos que se registran obtienen acceso inmediato (1 año gratis).
export default function ApprovalsRedirect() {
  redirect('/admin')
}
