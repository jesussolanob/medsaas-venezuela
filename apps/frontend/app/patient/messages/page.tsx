// RONDA 21: chat de paciente fuera del MVP por ahora.
// Si alguien tipea /patient/messages directo, lo redirigimos al dashboard.
// La logica original del chat queda en git history por si se reactiva en el futuro.
import { redirect } from 'next/navigation'

export default function PatientMessagesPage() {
  redirect('/patient')
}
