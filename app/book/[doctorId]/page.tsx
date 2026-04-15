import { createAdminClient } from '@/lib/supabase/admin'
import BookingClient from './BookingClient'
import { AlertCircle } from 'lucide-react'

// Server Component — fetches doctor data with admin client (bypasses RLS)
export default async function PublicBookingPage({ params }: { params: Promise<{ doctorId: string }> }) {
  const { doctorId } = await params   // Next.js 15: params is async
  const admin = createAdminClient()

  const { data: doctor } = await admin
    .from('profiles')
    .select('id, full_name, specialty, phone, avatar_url')
    .eq('id', doctorId)
    .maybeSingle()

  if (!doctor) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-lg font-bold text-slate-700">Médico no encontrado</h2>
          <p className="text-sm text-slate-400 mt-2">El link de booking no es válido o el médico ya no está disponible.</p>
          <p className="text-xs text-slate-300 mt-4 font-mono break-all">ID: {doctorId}</p>
        </div>
      </div>
    )
  }

  // Fetch active pricing plans
  const { data: plans } = await admin
    .from('pricing_plans')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('is_active', true)
    .order('price_usd')

  const activePlans = (plans && plans.length > 0)
    ? plans
    : [{ id: 'default', name: 'Consulta General', price_usd: 20, duration_minutes: 30, sessions_count: 1 }]

  return (
    <BookingClient
      doctor={{
        id: doctor.id,
        full_name: doctor.full_name ?? 'Médico',
        specialty: doctor.specialty ?? '',
        phone: doctor.phone ?? '',
        avatar_url: doctor.avatar_url ?? null,
      }}
      plans={activePlans}
    />
  )
}
