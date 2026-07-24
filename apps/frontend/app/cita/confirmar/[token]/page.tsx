'use client';

/**
 * /cita/confirmar/[token]
 *
 * Página pública — sin auth, sin sidebar.
 * El paciente llega aquí desde el link del email de recordatorio.
 *
 * Flujo:
 *   1. Al montar: GET /api/public/appointments/confirm-info?token=<token>
 *   2. Renderiza según status:
 *      - scheduled  → resumen + botón "Confirmar mi asistencia"
 *      - confirmed  → estado de éxito (checkmark verde)
 *      - cancelled  → mensaje informativo "Esta cita fue cancelada"
 *      - completed / no_show → "Esta cita ya no está activa"
 *      - 404 / error → "Este enlace no es válido o ha expirado"
 *   3. Al confirmar: POST /api/public/appointments/confirm { token }
 *      Muestra spinner mientras envía; en éxito transiciona a 'confirmed'.
 *      Error inline (sin alert()).
 */

import { useEffect, useState, useCallback, use } from 'react';
import {
  CheckCircle,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  Loader2,
  Stethoscope,
} from 'lucide-react';
import { DeltaMark } from '@/components/dh';

// ── Tokens de marca (alineados con BookingClient) ─────────────────────────────
const BRAND = {
  gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)',
  bone: '#FAFBFC',
  ink: '#0F1A2A',
} as const;

// ── Tipos ─────────────────────────────────────────────────────────────────────

type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';

interface AppointmentInfo {
  status: AppointmentStatus;
  doctorName: string;
  date: string;
  time: string;
  modality: string;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; info: AppointmentInfo }
  | { kind: 'confirmed'; info: AppointmentInfo };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatModality(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  if (normalized === 'online') return 'Videoconsulta';
  if (normalized === 'in_person' || normalized === 'presencial') return 'Presencial';
  // Valor desconocido: retornar con primera letra en mayúscula
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      * { font-family: 'Inter', sans-serif; }
    `}</style>
  );
}

function SpinnerView() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: BRAND.bone }}
    >
      <GlobalStyle />
      <div className="flex items-center gap-3 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Verificando enlace...</span>
      </div>
    </div>
  );
}

interface PageShellProps {
  children: React.ReactNode;
}

function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: BRAND.bone }}>
      <GlobalStyle />

      {/* Header con gradiente */}
      <div className="relative overflow-hidden" style={{ background: BRAND.gradient }}>
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'white' }}
        />
        <div
          className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full opacity-5"
          style={{ background: 'white' }}
        />
        <div className="relative max-w-lg mx-auto px-5 py-5">
          <div className="flex items-center gap-2 opacity-80">
            <DeltaMark size={22} primary="#fff" />
            <span className="text-[11px] font-semibold text-white/80 tracking-widest uppercase">
              Delta Salud
            </span>
          </div>
        </div>
      </div>

      {/* Contenido central */}
      <div className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <DeltaMark size={20} />
          <span className="text-xs font-semibold text-slate-400 tracking-wide">Delta Salud</span>
        </div>
      </div>
    </div>
  );
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-teal-500 shrink-0">{icon}</div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider leading-none mb-0.5">
          {label}
        </p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}

interface AppointmentCardProps {
  info: AppointmentInfo;
}

function AppointmentCard({ info }: AppointmentCardProps) {
  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3.5 border border-slate-100">
      <InfoRow
        icon={<Stethoscope className="w-4 h-4" />}
        label="Especialista"
        value={info.doctorName}
      />
      <InfoRow icon={<Calendar className="w-4 h-4" />} label="Fecha" value={info.date} />
      <InfoRow icon={<Clock className="w-4 h-4" />} label="Hora" value={info.time} />
      <InfoRow
        icon={<MapPin className="w-4 h-4" />}
        label="Modalidad"
        value={formatModality(info.modality)}
      />
    </div>
  );
}

// ── Vista: enlace inválido ────────────────────────────────────────────────────

function InvalidView() {
  return (
    <PageShell>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-7 h-7 text-amber-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-2">Enlace no válido</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          Este enlace no es válido o ha expirado. Si crees que es un error, contacta al consultorio
          directamente.
        </p>
      </div>
    </PageShell>
  );
}

// ── Vista: estado terminal (cancelada / completada / no asistió) ─────────────

interface TerminalViewProps {
  status: AppointmentStatus;
  info: AppointmentInfo;
}

function TerminalView({ status, info }: TerminalViewProps) {
  const message =
    status === 'cancelled' ? 'Esta cita fue cancelada.' : 'Esta cita ya no está activa.';

  return (
    <PageShell>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-7 h-7 text-slate-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-2 text-center">{message}</h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Si tienes dudas, comunícate con el consultorio.
        </p>
        <AppointmentCard info={info} />
      </div>
    </PageShell>
  );
}

// ── Vista: confirmación exitosa ───────────────────────────────────────────────

interface ConfirmedViewProps {
  info: AppointmentInfo;
}

function ConfirmedView({ info }: ConfirmedViewProps) {
  return (
    <PageShell>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-7 h-7 text-emerald-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-2 text-center">¡Cita confirmada!</h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Tu asistencia fue registrada. Te esperamos.
        </p>
        <AppointmentCard info={info} />
      </div>
    </PageShell>
  );
}

// ── Vista: lista para confirmar ───────────────────────────────────────────────

interface ReadyViewProps {
  info: AppointmentInfo;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: string | null;
}

function ReadyView({ info, onConfirm, confirming, confirmError }: ReadyViewProps) {
  return (
    <PageShell>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-5">
          <Calendar className="w-7 h-7 text-teal-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 mb-2 text-center">Confirma tu cita</h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Revisa los detalles de tu cita y confirma tu asistencia.
        </p>

        <AppointmentCard info={info} />

        {confirmError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{confirmError}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl px-5 py-3 transition-colors duration-150"
        >
          {confirming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirmando...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Confirmar mi asistencia
            </>
          )}
        </button>
      </div>
    </PageShell>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function ConfirmarCitaPage({ params }: PageProps) {
  const { token } = use(params);

  // Si el segmento de URL está vacío de alguna forma, comenzar directamente en 'invalid'.
  // Esto evita un setState síncrono dentro del efecto que dispara el lint rule.
  const initialState: PageState = token ? { kind: 'loading' } : { kind: 'invalid' };

  const [pageState, setPageState] = useState<PageState>(initialState);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // ── Carga inicial de la info de la cita ──────────────────────────────────
  useEffect(() => {
    // Si token no existe el estado ya fue inicializado como 'invalid'; no hacer nada.
    if (!token) return;

    const controller = new AbortController();

    async function fetchInfo() {
      try {
        const res = await fetch(
          `/api/public/appointments/confirm-info?token=${encodeURIComponent(token)}`,
          { signal: controller.signal, cache: 'no-store' },
        );

        if (res.status === 404) {
          setPageState({ kind: 'invalid' });
          return;
        }

        const json = (await res.json()) as {
          data?: AppointmentInfo;
          error?: string;
        };

        if (!res.ok || !json.data) {
          if (res.status === 404) {
            setPageState({ kind: 'invalid' });
          } else {
            setPageState({
              kind: 'error',
              message: json.error ?? 'No se pudo cargar la información de la cita.',
            });
          }
          return;
        }

        const info = json.data;

        if (info.status === 'confirmed') {
          setPageState({ kind: 'confirmed', info });
        } else {
          setPageState({ kind: 'ready', info });
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setPageState({
          kind: 'error',
          message: 'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
        });
      }
    }

    void fetchInfo();
    return () => controller.abort();
  }, [token]);

  // ── Acción de confirmación ───────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (confirming || pageState.kind !== 'ready') return;

    setConfirming(true);
    setConfirmError(null);

    try {
      const res = await fetch('/api/public/appointments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const json = (await res.json()) as {
        data?: AppointmentInfo;
        error?: string;
      };

      if (!res.ok || !json.data) {
        setConfirmError(json.error ?? 'No se pudo confirmar la cita. Intenta de nuevo.');
        return;
      }

      // Idempotente: el backend puede devolver 'confirmed' aunque ya estaba confirmada
      setPageState({ kind: 'confirmed', info: json.data });
    } catch {
      setConfirmError(
        'No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.',
      );
    } finally {
      setConfirming(false);
    }
  }, [confirming, pageState.kind, token]);

  // ── Render según estado ──────────────────────────────────────────────────
  if (pageState.kind === 'loading') {
    return <SpinnerView />;
  }

  if (pageState.kind === 'invalid') {
    return <InvalidView />;
  }

  if (pageState.kind === 'error') {
    return (
      <PageShell>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">Algo salió mal</h1>
          <p className="text-sm text-slate-500 leading-relaxed">{pageState.message}</p>
        </div>
      </PageShell>
    );
  }

  if (pageState.kind === 'confirmed') {
    return <ConfirmedView info={pageState.info} />;
  }

  // kind === 'ready'
  const { info } = pageState;
  const isTerminal =
    info.status === 'cancelled' || info.status === 'completed' || info.status === 'no_show';

  if (isTerminal) {
    return <TerminalView status={info.status} info={info} />;
  }

  return (
    <ReadyView
      info={info}
      onConfirm={handleConfirm}
      confirming={confirming}
      confirmError={confirmError}
    />
  );
}
