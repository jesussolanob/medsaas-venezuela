'use client';

/**
 * NewRequestModal — modal para que el médico cree una solicitud de documentos al paciente.
 *
 * Reutilizable desde:
 *   - /doctor/patient-requests (lista principal, paciente seleccionable)
 *   - /doctor/patients (ficha del paciente, paciente pre-seleccionado)
 *
 * Flujo:
 *   1. Seleccionar / confirmar paciente
 *   2. Ingresar título (requerido) y descripción (opcional)
 *   3. POST /api/doctor/patient-requests
 *   4. Mostrar la URL del portal + botón copiar para compartir
 */

import { useState } from 'react';
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Search,
  User,
  FileUp,
} from 'lucide-react';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface PatientOption {
  id: string;
  full_name: string;
}

interface NewRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** Llamado con el id de la solicitud creada */
  onSuccess: (requestId: string) => void;
  /** Lista de pacientes disponibles para seleccionar */
  patients: PatientOption[];
  /** Si se provee, el paciente queda fijo (sin selector) */
  defaultPatient?: { id: string; name: string };
}

interface CreateResponse {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function NewRequestModal({
  open,
  onClose,
  onSuccess,
  patients,
  defaultPatient,
}: NewRequestModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    defaultPatient ? { id: defaultPatient.id, full_name: defaultPatient.name } : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const filteredPatients = patients.filter((p) =>
    p.full_name.toLowerCase().includes(patientSearch.toLowerCase()),
  );

  async function handleCreate() {
    if (!selectedPatient) {
      setError('Debes seleccionar un paciente.');
      return;
    }
    if (!title.trim()) {
      setError('El título es requerido.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/doctor/patient-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          title: title.trim(),
          description: description.trim() || null,
        }),
      });

      const json = (await res.json()) as
        | { success: true; data: CreateResponse }
        | { error: string };

      if (!res.ok || !('success' in json)) {
        setError('error' in json ? json.error : 'No se pudo crear la solicitud.');
        return;
      }

      setCreated(json.data);
      onSuccess(json.data.id);
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: mostrar el URL para que el doctor lo copie manualmente
    }
  }

  function handleClose() {
    // Resetear estado al cerrar
    setTitle('');
    setDescription('');
    setPatientSearch('');
    setSelectedPatient(
      defaultPatient ? { id: defaultPatient.id, full_name: defaultPatient.name } : null,
    );
    setSubmitting(false);
    setError(null);
    setCreated(null);
    setCopied(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-request-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
            >
              <FileUp className="w-4 h-4 text-white" />
            </div>
            <h2 id="new-request-title" className="text-sm font-bold text-slate-800">
              Solicitar documentos al paciente
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Estado: creado exitosamente */}
          {created ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Solicitud creada</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Se envió un email al paciente con el código de acceso.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Enlace del portal (también puedes compartirlo manualmente)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={created.url}
                    className="flex-1 min-w-0 text-xs px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 truncate focus:outline-none focus:ring-1 focus:ring-teal-300"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => void handleCopy()}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-600">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  El enlace vence en 48 horas. El paciente también necesita el código que recibió
                  por email y su cédula para acceder.
                </p>
              </div>

              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white transition-colors"
              >
                Listo
              </button>
            </div>
          ) : (
            /* Estado: formulario */
            <>
              {/* Selector de paciente */}
              {defaultPatient ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Paciente
                  </p>
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                      <span className="text-teal-700 font-bold text-xs">
                        {defaultPatient.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-slate-700 truncate">
                      {defaultPatient.name}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Paciente
                  </p>
                  {selectedPatient ? (
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-teal-50 border border-teal-200 rounded-xl">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                          <span className="text-teal-700 font-bold text-xs">
                            {selectedPatient.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-teal-800 truncate">
                          {selectedPatient.full_name}
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedPatient(null)}
                        className="shrink-0 text-teal-500 hover:text-teal-700 text-xs underline"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Buscar paciente..."
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400"
                        />
                      </div>
                      <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {filteredPatients.length === 0 ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-400">
                            <User className="w-3.5 h-3.5" />
                            No se encontraron pacientes
                          </div>
                        ) : (
                          filteredPatients.slice(0, 20).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedPatient(p);
                                setPatientSearch('');
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                            >
                              <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                                <span className="text-teal-700 font-bold text-xs">
                                  {p.full_name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-sm text-slate-700 truncate">{p.full_name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Título */}
              <div className="space-y-1.5">
                <label
                  htmlFor="nr-title"
                  className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Título <span className="text-red-400">*</span>
                </label>
                <input
                  id="nr-title"
                  type="text"
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Resultados de exámenes de laboratorio"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 transition-shadow"
                />
              </div>

              {/* Descripción */}
              <div className="space-y-1.5">
                <label
                  htmlFor="nr-description"
                  className="text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Descripción{' '}
                  <span className="normal-case font-normal text-slate-400">(opcional)</span>
                </label>
                <textarea
                  id="nr-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instrucciones adicionales para el paciente..."
                  rows={3}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 placeholder-slate-300 text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-400 transition-shadow"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <p className="text-xs text-slate-400">
                El paciente recibirá un email con el enlace y un código de acceso de 6 dígitos.
                Necesitará su cédula y el código para subir los documentos.
              </p>
            </>
          )}
        </div>

        {/* Footer — solo visible en el formulario */}
        {!created && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={submitting || !title.trim() || (!selectedPatient && !defaultPatient)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear solicitud'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
