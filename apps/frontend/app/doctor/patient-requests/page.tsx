'use client';

/**
 * /doctor/patient-requests — Lista y gestión de solicitudes de documentos al paciente.
 *
 * Accesible por URL directo y desde la ficha del paciente (/doctor/patients).
 *
 * NOTA DE GATING (sidebar):
 *   Esta ruta NO está registrada en el sidebar del doctor (doctor/layout.tsx).
 *   Agregar un nuevo moduleKey al sistema de gating (role_capabilities + plan_features)
 *   requeriría cambios de BD y migraciones de backend que están fuera de este alcance.
 *   Para evitar romper el gating existente, la página es accesible por URL directa
 *   y mediante el botón "Solicitar documentos" en la ficha del paciente.
 *
 *   Para agregar el ítem al sidebar en el futuro, añadir en doctor/layout.tsx:
 *     { name: 'Solicitudes', href: '/doctor/patient-requests', icon: FileUp, moduleKey: 'patient_requests' }
 *   y crear el feature key correspondiente en BD (role_capabilities + plan_features).
 */

import { useState, useEffect } from 'react';
import {
  FileUp,
  Plus,
  Loader2,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Paperclip,
  ChevronRight,
  Users,
} from 'lucide-react';
import NewRequestModal, { type PatientOption } from '@/components/patient-requests/NewRequestModal';
import RequestDetailModal from './RequestDetailModal';
import { showToast } from '@/components/ui/Toaster';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface PatientRequestItem {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  attachmentCount: number;
  createdAt: string;
  fulfilledAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

const STATUS_CONFIG: Record<
  PatientRequestItem['status'],
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pendiente',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: <Clock className="w-3 h-3" />,
  },
  fulfilled: {
    label: 'Respondida',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  revoked: {
    label: 'Revocada',
    className: 'bg-slate-100 text-slate-500 border border-slate-200',
    icon: <XCircle className="w-3 h-3" />,
  },
};

// ─── Componente ──────────────────────────────────────────────────────────────

export default function PatientRequestsPage() {
  const [items, setItems] = useState<PatientRequestItem[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/doctor/patient-requests');
      const json = (await res.json()) as
        | { success: true; data: { items: PatientRequestItem[] } }
        | { error: string };

      if (!res.ok || !('success' in json)) {
        setLoadError('error' in json ? json.error : 'No se pudo cargar la lista.');
        return;
      }

      setItems(json.data.items ?? []);
    } catch {
      setLoadError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPatients() {
    try {
      const res = await fetch('/api/doctor/patients?page=1&limit=200');
      const json = (await res.json()) as
        | { success: true; data: { patients: Array<{ id: string; fullName: string }> } }
        | { error: string };

      if (!res.ok || !('success' in json)) return;

      const list = json.data.patients ?? [];
      setPatients(list.map((p) => ({ id: p.id, full_name: p.fullName })));
    } catch {
      // silencioso: el modal mostrará la lista vacía
    }
  }

  useEffect(() => {
    void loadRequests();
    void loadPatients();
  }, []);

  function handleCreateSuccess(_requestId: string) {
    showToast({ type: 'success', message: 'Solicitud creada. El paciente recibirá un email.' });
    void loadRequests();
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
          >
            <FileUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Solicitudes de documentos</h1>
            <p className="text-sm text-slate-500">
              Solicita archivos o respuestas escritas a tus pacientes.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva solicitud
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando solicitudes...
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm text-slate-600">{loadError}</p>
          <button
            onClick={() => void loadRequests()}
            className="flex items-center gap-1.5 text-sm text-teal-600 font-semibold hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-slate-600 font-semibold">Sin solicitudes aún</p>
          <p className="text-slate-400 text-sm mt-1">
            Crea tu primera solicitud para pedirle documentos a un paciente.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva solicitud
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {items.map((item, i) => {
            const status = STATUS_CONFIG[item.status];
            return (
              <button
                key={item.id}
                onClick={() => setDetailId(item.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left ${
                  i < items.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                  <span className="text-teal-600 font-bold text-sm">
                    {item.patientName.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status.className}`}
                    >
                      {status.icon}
                      {status.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{item.patientName}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                    {item.attachmentCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-teal-600 font-medium">
                        <Paperclip className="w-3 h-3" />
                        {item.attachmentCount} adjunto{item.attachmentCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Modal: crear solicitud */}
      <NewRequestModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        patients={patients}
      />

      {/* Modal: detalle */}
      {detailId !== null && (
        <RequestDetailModal requestId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}
