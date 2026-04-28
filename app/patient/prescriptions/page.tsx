/**
 * RONDA 40: este path quedo legacy. Ahora todo (recetas + archivos + tareas)
 * vive en /patient/seguimiento (Mi Seguimiento). Redirigimos para no romper
 * enlaces viejos guardados por pacientes.
 */
import { redirect } from 'next/navigation'

export default function LegacyPrescriptionsRedirect() {
  redirect('/patient/seguimiento')
}
