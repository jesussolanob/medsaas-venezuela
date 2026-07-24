import { notFound } from 'next/navigation';
// Data layer: backend via BFF (api-client.server). Supabase removed (Fase 7).
//
// DEFERRED: There is no GET /api/patient/reports endpoint in the patient-portal
// controller. Exposing clinical data (diagnosis, treatment, report_data) to the
// patient is an explicit product decision that has not been made yet.
// Tracked as TODO in the backend controller comment:
//   "GET /patient/reports — clinical data exposure requires product decision"
//
// Until that endpoint exists this page will return notFound() so the URL is safe
// (no data leak, no broken JSX). The JSX and component structure are preserved
// unchanged so they can be wired once the endpoint ships.
//
// Referenced files kept but NOT imported:
//   @/components/consultation/ReportBlocksViewer
//   @/lib/report-data
import { Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import ReportBlocksViewer from '@/components/consultation/ReportBlocksViewer';
import type { ReportData } from '@/lib/report-data';

type ConsultationData = {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  report_data: ReportData | null;
  patient: { full_name: string; phone: string | null; email: string | null };
  doctor: { full_name: string; specialty: string | null };
};

export default async function ConsultationReportPage({
  params,
}: {
  params: Promise<{ patientId: string; consultationId: string }>;
}) {
  // DEFERRED: no backend endpoint for clinical report data.
  // Return 404 until GET /api/patient/reports (or /api/patient/report/:id) ships.
  // This prevents serving a broken page and avoids any Supabase dependency.
  void params;
  notFound();

  // The JSX below is unreachable but preserved for when the endpoint is ready.
  // TypeScript requires a return type; notFound() throws so this is dead code.
  const data = null as unknown as ConsultationData;
  const patientId = '';

  const reportDate = new Date().toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-bg { background: linear-gradient(135deg,#00C4CC 0%,#0891b2 100%); }
        @media print {
          .no-print { display: none !important; }
          .page { break-after: always; }
        }
      `}</style>

      <div className="min-h-screen bg-slate-50">
        {/* Toolbar */}
        <div className="sticky top-0 no-print bg-white border-b border-slate-200 shadow-sm z-50">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link
              href={`/patient/${patientId}`}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Volver
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 g-bg text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>
          </div>
        </div>

        {/* Report */}
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
            {/* Header */}
            <div className="border-b-2 border-slate-200 pb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Informe de Consulta</h1>
                  <p className="text-slate-500 mt-1">
                    Código:{' '}
                    <span className="font-mono font-bold text-teal-600">
                      {data.consultation_code}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">Generado el</p>
                  <p className="text-lg font-semibold text-slate-900">{reportDate}</p>
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-8">
              {/* Paciente */}
              <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
                  Datos del Paciente
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-slate-500">Nombre</p>
                    <p className="font-semibold text-slate-900">{data.patient.full_name}</p>
                  </div>
                  {data.patient.email && (
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="text-sm text-slate-700">{data.patient.email}</p>
                    </div>
                  )}
                  {data.patient.phone && (
                    <div>
                      <p className="text-xs text-slate-500">Teléfono</p>
                      <p className="text-sm text-slate-700">{data.patient.phone}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Médico */}
              <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
                  Datos del Especialista
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-slate-500">Especialista</p>
                    <p className="font-semibold text-slate-900">Dr(a). {data.doctor.full_name}</p>
                  </div>
                  {data.doctor.specialty && (
                    <div>
                      <p className="text-xs text-slate-500">Especialidad</p>
                      <p className="text-sm text-slate-700">{data.doctor.specialty}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500">Fecha de Consulta</p>
                    <p className="text-sm text-slate-700">
                      {new Date(data.consultation_date).toLocaleDateString('es-VE')} a las{' '}
                      {new Date(data.consultation_date).toLocaleTimeString('es-VE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {data.report_data != null &&
            Array.isArray((data.report_data as ReportData).blocks) &&
            (data.report_data as ReportData).blocks.length > 0 ? (
              <ReportBlocksViewer report={data.report_data as ReportData} forPatient />
            ) : (
              <>
                {data.chief_complaint && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
                      Motivo de Consulta
                    </h3>
                    <p className="text-slate-900 text-lg">{data.chief_complaint}</p>
                  </div>
                )}
                {data.diagnosis && (
                  <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-6">
                    <h3 className="text-sm font-bold text-blue-900 uppercase tracking-widest mb-3">
                      Diagnóstico
                    </h3>
                    <p className="text-slate-900">{data.diagnosis}</p>
                  </div>
                )}
                {data.treatment && (
                  <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-6">
                    <h3 className="text-sm font-bold text-green-900 uppercase tracking-widest mb-3">
                      Tratamiento Recomendado
                    </h3>
                    <p className="text-slate-900 whitespace-pre-wrap">{data.treatment}</p>
                  </div>
                )}
                {data.notes && (
                  <div>
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
                      Notas Adicionales
                    </h3>
                    <p className="text-slate-700 whitespace-pre-wrap">{data.notes}</p>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <div className="border-t border-slate-200 pt-6 mt-8 text-center text-xs text-slate-500">
              <p>Documento generado por Delta Salud</p>
              <p>Este documento contiene información confidencial de salud.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
