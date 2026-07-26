import { notFound } from 'next/navigation';
// Data layer: backend via BFF (api-client.server). Supabase removed (Fase 7).
// DEFERRED: consultations clinical data (diagnosis/treatment) has no endpoint
// in patient-portal today — GET /patient/reports is explicitly deferred pending
// a product decision on clinical data exposure. Returns empty array for now.
import { getPatientProfile, getPatientAppointments } from '@/app/patient/actions';
import { Calendar, FileText, Download, ArrowRight, User, Clock } from 'lucide-react';

type Patient = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type Appointment = {
  id: string;
  patient_name: string;
  appointment_date: string;
  chief_complaint: string | null;
  plan_name: string | null;
  plan_price: number | null;
};

type Consultation = {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
};

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;

  // Fetch profile from backend (scoped to auth_user_id, anti-IDOR).
  // The patientId param is used only for routing; data comes from the session scope.
  const profiles = await getPatientProfile();
  const profile = profiles.length > 0 ? profiles[0] : null;

  if (!profile) notFound();

  const patient: Patient = {
    id: profile.id,
    full_name: profile.fullName,
    email: profile.email,
    phone: profile.phone,
  };

  // Fetch appointment history from backend; filter upcoming ones client-less.
  const allAppointments = await getPatientAppointments({ page: 1, limit: 50 });
  const now = new Date().toISOString();
  const upcomingAppointments: Appointment[] = allAppointments
    .filter((a) => a.scheduledAt >= now)
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      patient_name: patient.full_name,
      appointment_date: a.scheduledAt,
      chief_complaint: a.chiefComplaint,
      plan_name: a.planName,
      plan_price: a.planPrice,
    }));

  // DEFERRED: GET /patient/reports (clinical consultations exposure) not yet available.
  // Product decision pending. Returns empty list until the endpoint exists.
  const pastConsultations: Consultation[] = [];

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-white">
        {/* Hero Section */}
        <div className="g-bg text-white py-16 px-4">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-white/30">
                <User className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold">Hola, {patient.full_name.split(' ')[0]}</h1>
                <p className="text-white/80 text-lg mt-2">Panel de tus citas y consultas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
          {/* Upcoming Appointments */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                <Calendar className="w-5 h-5 text-teal-500" />
                Próximas citas
              </h2>
              <p className="text-sm text-slate-500 mt-1">Citas agendadas para futuro</p>
            </div>

            {upcomingAppointments.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No hay citas próximas</p>
                <p className="text-slate-300 text-xs mt-1">
                  Las citas que reserves aparecerán aquí
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingAppointments.map((appt) => (
                  <div key={appt.id} className="px-6 py-5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full g-bg flex items-center justify-center">
                            <Clock className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">
                              {appt.plan_name || 'Consulta'}
                            </p>
                            <p className="text-sm text-slate-500">
                              {new Date(appt.appointment_date).toLocaleDateString('es-VE', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}{' '}
                              a las{' '}
                              {new Date(appt.appointment_date).toLocaleTimeString('es-VE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        {appt.chief_complaint && (
                          <p className="text-sm text-slate-600 mt-2 italic">
                            Motivo: {appt.chief_complaint}
                          </p>
                        )}
                        {appt.plan_price && (
                          <p className="text-sm font-semibold text-emerald-600 mt-2">
                            ${appt.plan_price} USD
                          </p>
                        )}
                      </div>
                      <span className="px-3 py-1 bg-teal-100 text-teal-700 text-xs font-semibold rounded-full">
                        Por agendar
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Consultations */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                <FileText className="w-5 h-5 text-amber-500" />
                Historial de consultas
              </h2>
              <p className="text-sm text-slate-500 mt-1">Todas tus consultas realizadas</p>
            </div>

            {pastConsultations.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Sin consultas registradas</p>
                <p className="text-slate-300 text-xs mt-1">
                  Las consultas completadas aparecerán aquí
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pastConsultations.map((consultation) => (
                  <div
                    key={consultation.id}
                    className="px-6 py-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Fecha
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {new Date(consultation.consultation_date).toLocaleDateString('es-VE')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Código
                        </p>
                        <p className="text-sm font-mono text-teal-600">
                          {consultation.consultation_code}
                        </p>
                      </div>
                    </div>

                    {consultation.chief_complaint && (
                      <div className="mb-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Motivo
                        </p>
                        <p className="text-sm text-slate-700">{consultation.chief_complaint}</p>
                      </div>
                    )}

                    {consultation.diagnosis && (
                      <div className="mb-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Diagnóstico
                        </p>
                        <p className="text-sm text-slate-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          {consultation.diagnosis}
                        </p>
                      </div>
                    )}

                    {consultation.treatment && (
                      <div className="mb-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                          Tratamiento
                        </p>
                        <p className="text-sm text-slate-700 bg-green-50 border border-green-200 rounded-lg p-3">
                          {consultation.treatment}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-slate-100">
                      <a
                        href={`/patient/${patientId}/report/${consultation.id}`}
                        className="flex items-center gap-2 px-4 py-2 g-bg text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                      >
                        <Download className="w-4 h-4" /> Descargar PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Contact Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-8 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-white/60 uppercase tracking-widest font-semibold mb-2">
                  Contacto
                </p>
                <p className="text-xl font-bold mb-4">¿Preguntas o cambios?</p>
                {patient.email && (
                  <p className="text-white/80 mb-2">
                    📧 <span className="font-mono">{patient.email}</span>
                  </p>
                )}
                {patient.phone && (
                  <p className="text-white/80">
                    📱 <span className="font-mono">{patient.phone}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center">
                <div className="text-right w-full">
                  <p className="text-sm text-white/60 mb-2">Plataforma segura de</p>
                  <p className="text-xl font-bold">Delta Salud</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
