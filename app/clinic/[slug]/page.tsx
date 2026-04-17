'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { Building2, Users, ArrowRight, MapPin, Award } from 'lucide-react'
import Link from 'next/link'
import { getProfessionalTitle } from '@/lib/professional-title'

type Clinic = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  address: string | null
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  description: string | null
}

type Doctor = {
  id: string
  full_name: string
  specialty: string | null
  avatar_url: string | null
  professional_title: string | null
  city: string | null
  state: string | null
  office_address: string | null
}

export default async function ClinicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  // Fetch clinic by slug
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (clinicError || !clinic) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }`}</style>
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Clínica no encontrada</h1>
          <p className="text-sm text-slate-500">La clínica que buscas no está disponible o fue desactivada.</p>
          <Link href="/" className="inline-block text-teal-600 font-semibold hover:text-teal-700">
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  // Fetch doctors in this clinic
  const { data: doctors } = await admin
    .from('profiles')
    .select('id, full_name, specialty, avatar_url, professional_title, city, state, office_address')
    .eq('clinic_id', clinic.id)
    .eq('is_active', true)

  const clinicDoctors: Doctor[] = doctors || []

  const location = [clinic.city, clinic.state].filter(Boolean).join(', ')

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }`}</style>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-start gap-6">
              {/* Logo */}
              <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                {clinic.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clinic.logo_url} alt={clinic.name} className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-10 h-10 text-slate-400" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{clinic.name}</h1>
                {clinic.description && (
                  <p className="text-sm text-slate-600 mb-3">{clinic.description}</p>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  {location && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                      <MapPin className="w-4 h-4 text-teal-600" />
                      {location}
                    </div>
                  )}
                  {clinic.phone && (
                    <a href={`tel:${clinic.phone}`} className="text-sm text-teal-600 hover:text-teal-700 font-semibold">
                      {clinic.phone}
                    </a>
                  )}
                  {clinic.email && (
                    <a href={`mailto:${clinic.email}`} className="text-sm text-teal-600 hover:text-teal-700 font-semibold">
                      {clinic.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Section title */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Users className="w-6 h-6 text-teal-600" />
              Nuestro Equipo Médico
            </h2>
            <p className="text-slate-600">Selecciona un especialista y agenda tu cita</p>
          </div>

          {/* Doctors grid */}
          {clinicDoctors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clinicDoctors.map(doctor => (
                <div
                  key={doctor.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow group"
                >
                  {/* Avatar */}
                  <div className="h-40 bg-gradient-to-br from-teal-100 to-teal-50 flex items-center justify-center overflow-hidden">
                    {doctor.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={doctor.avatar_url}
                        alt={doctor.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-teal-200 flex items-center justify-center text-teal-700 text-2xl font-bold">
                        {doctor.full_name
                          ?.split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-slate-900 mb-1">
                      {getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}
                    </h3>
                    {doctor.specialty && (
                      <p className="text-sm text-teal-600 font-semibold mb-3">{doctor.specialty}</p>
                    )}

                    {/* Location */}
                    {(doctor.office_address || doctor.city || doctor.state) && (
                      <div className="flex items-start gap-2 text-xs text-slate-600 mb-4">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <span>
                          {doctor.office_address || [doctor.city, doctor.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Badge */}
                    <div className="mb-4 flex items-center gap-1.5 text-xs text-slate-600">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      Especialista certificado
                    </div>

                    {/* CTA Button */}
                    <Link
                      href={`/book/${doctor.id}`}
                      className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2.5 rounded-lg transition-colors group-hover:shadow-md"
                    >
                      Agendar cita
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Sin doctores disponibles</h3>
              <p className="text-sm text-slate-600">Esta clínica aún no tiene especialistas registrados.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 py-8 mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
            <p>© 2026 MedSaaS. Plataforma de agendamiento médico. Todos los derechos reservados.</p>
          </div>
        </div>
      </div>
    </>
  )
}
