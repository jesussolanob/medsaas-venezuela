'use client';

import { useEffect, useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
// Data layer: backend via BFF server actions. Supabase removed (Fase 7).
//
// DEFERRED: clinical consultation data (notes/diagnosis/treatment/report_data)
// has no patient-portal endpoint yet. The backend controller comment explicitly
// defers GET /patient/reports pending a product decision on clinical data
// exposure. Until that endpoint ships, this page shows an empty list.
//
// Available and wired:
//   getPatientProfile()       → GET /api/patient/profile   (identifies the patient)
//   getPatientPrescriptions() → GET /api/patient/prescriptions (flat list, decrypted)
//
// NOT available yet (returns empty):
//   clinical consultation list with notes/diagnosis/treatment/report_data
import { getPatientProfile, getPatientPrescriptions } from '@/app/patient/actions';
import { reportError } from '@/lib/report-error';
// RONDA 36: render dinámico desde report_data (snapshot inmutable)
import ReportBlocksViewer from '@/components/consultation/ReportBlocksViewer';
import type { ReportData } from '@/lib/report-data';
// AUDIT FIX 2026-04-28 (C-9): sanitizer para HTML rich-text (defense-in-depth).
import { sanitizeHtml } from '@/lib/sanitize-html';

// RONDA 30: incluir medications de la tabla prescriptions vinculadas por consultation_id
type Medication = {
  name?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  indications?: string;
};

interface Report {
  id: string;
  consultation_code: string;
  consultation_date: string;
  chief_complaint: string | null;
  notes: string | null;
  diagnosis: string | null;
  treatment: string | null;
  // RONDA 36: snapshot inmutable. Si existe, es la fuente de verdad.
  report_data: ReportData | null;
  doctor_id: string;
  doctor_name: string;
  doctor_specialty: string | null;
  doctor_title: string | null;
  medications: Medication[];
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const loadReports = async () => {
      try {
        // Verify patient identity via profile endpoint.
        // If no profile exists, there are no reports to show.
        const profiles = await getPatientProfile();
        if (!profiles || profiles.length === 0) {
          setLoading(false);
          return;
        }

        // DEFERRED: GET /api/patient/reports (clinical consultation exposure) does
        // not exist yet. The backend controller explicitly defers this pending a
        // product decision. Until then we return an empty list — the JSX already
        // handles this gracefully with the "No hay informes disponibles" empty state.
        //
        // When the endpoint is ready:
        //   1. Add getPatientReports() to app/patient/actions.ts
        //   2. Map the response to the Report[] shape
        //   3. Merge with getPatientPrescriptions() by consultationId

        setReports([]);
        setLoading(false);
      } catch (err) {
        reportError('patient/reports', 'loadReports', err);
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getTextPreview = (text: string | null, maxLength: number = 150): string => {
    if (!text) return '';
    // Strip HTML tags for preview
    const plainText = text.replace(/<[^>]*>/g, '').trim();
    if (plainText.length > maxLength) {
      return plainText.substring(0, maxLength) + '...';
    }
    return plainText;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando informes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1
        className="font-semibold tracking-tight"
        style={{
          fontFamily: 'var(--dh-font-display)',
          fontSize: 'clamp(22px, 3.2vw, 32px)',
          color: 'var(--dh-ink)',
        }}
      >
        Mis Informes Médicos
      </h1>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay informes disponibles</p>
          <p className="text-sm text-slate-400 mt-1">
            Tus informes aparecerán aquí después de tus consultas
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:border-slate-300"
            >
              {/* Header - Always visible */}
              <button
                onClick={() => toggleExpand(report.id)}
                className="w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-teal-50 shrink-0">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                      <p className="font-semibold text-slate-900 text-sm sm:text-base">
                        {report.consultation_code}
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500">
                        {new Date(report.consultation_date).toLocaleDateString('es-VE')}
                      </p>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Dr(a). {report.doctor_name}
                      {report.doctor_title && ` - ${report.doctor_title}`}
                      {report.doctor_specialty && ` (${report.doctor_specialty})`}
                    </p>
                    {report.chief_complaint && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        Motivo: {report.chief_complaint}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-slate-500">
                    {expandedId === report.id ? 'Ver menos' : 'Ver más'}
                  </span>
                  <div className="text-teal-600">
                    {expandedId === report.id ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {expandedId === report.id && (
                <div className="border-t border-slate-200 px-4 sm:px-6 py-4 sm:py-5 space-y-4">
                  {/* RONDA 36 + AUDIT FIX C-9: render dinámico desde report_data
                      (snapshot inmutable) cuando exista; fallback al render legacy
                      con sanitizeHtml para defense-in-depth contra XSS. */}
                  {report.report_data &&
                  Array.isArray(report.report_data.blocks) &&
                  report.report_data.blocks.length > 0 ? (
                    <ReportBlocksViewer report={report.report_data} forPatient />
                  ) : (
                    <>
                      {report.chief_complaint && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Motivo de la Consulta
                          </p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">
                            {report.chief_complaint}
                          </p>
                        </div>
                      )}
                      {report.notes && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Informe Médico
                          </p>
                          <div
                            className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.notes) }}
                          />
                        </div>
                      )}
                      {report.diagnosis && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Diagnóstico
                          </p>
                          <div
                            className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.diagnosis) }}
                          />
                        </div>
                      )}
                      {report.treatment && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Plan de Tratamiento
                          </p>
                          <div
                            className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(report.treatment) }}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* RONDA 30 — Medicamentos recetados con NOMBRE + dosis + frecuencia.
                      Antes el paciente solo veia "50mg 2 veces..." porque el doctor escribia
                      la dosis en el campo `treatment` y el nombre quedaba en otra tabla. */}
                  {report.medications.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Medicamentos recetados ({report.medications.length})
                      </p>
                      <div className="space-y-2">
                        {report.medications.map((m, i) => (
                          <div key={i} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                            <p className="font-bold text-sm text-teal-900 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {i + 1}
                              </span>
                              {m.name}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 ml-6.5 text-xs text-teal-800">
                              {m.dose && (
                                <span>
                                  <strong>Dosis:</strong> {m.dose}
                                </span>
                              )}
                              {m.frequency && (
                                <span>
                                  <strong>Frecuencia:</strong> {m.frequency}
                                </span>
                              )}
                              {m.duration && (
                                <span>
                                  <strong>Duración:</strong> {m.duration}
                                </span>
                              )}
                            </div>
                            {m.indications && (
                              <p className="text-xs text-teal-700 italic mt-1.5 ml-6">
                                {m.indications}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
