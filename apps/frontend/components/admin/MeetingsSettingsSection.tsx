'use client';

/**
 * MeetingsSettingsSection — admin settings sub-section for team-meeting config.
 *
 * Manages:
 *   - meeting_prompt_enabled: toggle to enable/disable the "Queremos conocerte" modal.
 *   - meeting_prompt_min_days: minimum days since registration before showing.
 *   - meeting_prompt_snooze_days: days to snooze when "Ahora no".
 *   - meeting_prompt_max_shows: max times the modal can appear.
 *   - Meeting host: select among super_admins; show Google status; "Conectar Google" button.
 *
 * Extracted as a sibling section to SupportContactSection to keep
 * apps/admin/settings/page.tsx under 800 lines.
 */

import { useEffect, useState } from 'react';
import { Video, Loader2, Save, CheckCircle2, AlertCircle, UserCog, Link2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface MeetingHost {
  profileId: string | null;
  fullName: string | null;
  email: string | null;
  googleConnected: boolean;
}

// ---------------------------------------------------------------------------
// Inner component (uses useSearchParams — needs Suspense wrapper)
// ---------------------------------------------------------------------------

function MeetingsSettingsSectionInner() {
  const searchParams = useSearchParams();

  // App settings
  const [enabled, setEnabled] = useState(true);
  const [minDays, setMinDays] = useState('3');
  const [snoozeDays, setSnoozeDays] = useState('1');
  const [maxShows, setMaxShows] = useState('3');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Host
  const [host, setHost] = useState<MeetingHost | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState('');
  const [loadingHost, setLoadingHost] = useState(true);
  const [savingHost, setSavingHost] = useState(false);
  const [hostMsg, setHostMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Google connection feedback from callback
  const googleParam = searchParams.get('google');
  const googleErrorParam = searchParams.get('google_error');

  // ---------------------------------------------------------------------------
  // Load settings
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Array<{ key: string; value: string }> };
        if (cancelled) return;
        const rows = json.data ?? [];
        const get = (key: string) => rows.find((r) => r.key === key)?.value ?? '';
        const en = get('meeting_prompt_enabled');
        if (en !== '') setEnabled(en !== 'false');
        const md = get('meeting_prompt_min_days');
        if (md) setMinDays(md);
        const sd = get('meeting_prompt_snooze_days');
        if (sd) setSnoozeDays(sd);
        const ms = get('meeting_prompt_max_shows');
        if (ms) setMaxShows(ms);
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoadingSettings(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load host + super admins
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [hostRes, adminsRes] = await Promise.all([
          fetch('/api/admin/team-meetings/host', { cache: 'no-store' }),
          fetch('/api/admin/admins', { cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (hostRes.ok) {
          const j = (await hostRes.json()) as { data?: MeetingHost };
          setHost(j.data ?? null);
          if (j.data?.profileId) setSelectedAdminId(j.data.profileId);
        }
        if (adminsRes.ok) {
          const j = (await adminsRes.json()) as { data?: AdminUser[] };
          setAdmins(j.data ?? []);
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoadingHost(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Save helpers
  // ---------------------------------------------------------------------------
  async function saveSetting(key: string, value: string) {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      throw new Error(j.error ?? 'Error al guardar');
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      await Promise.all([
        saveSetting('meeting_prompt_enabled', String(enabled)),
        saveSetting('meeting_prompt_min_days', minDays),
        saveSetting('meeting_prompt_snooze_days', snoozeDays),
        saveSetting('meeting_prompt_max_shows', maxShows),
      ]);
      setSettingsMsg({ kind: 'ok', text: 'Configuración guardada.' });
    } catch (e: unknown) {
      setSettingsMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Error al guardar',
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveHost() {
    if (!selectedAdminId) return;
    setSavingHost(true);
    setHostMsg(null);
    try {
      const res = await fetch('/api/admin/team-meetings/host', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedAdminId }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setHostMsg({ kind: 'err', text: j.error ?? 'Error al guardar' });
        return;
      }
      setHostMsg({ kind: 'ok', text: 'Anfitrión guardado.' });
      // Refresh host
      const hostRes = await fetch('/api/admin/team-meetings/host', { cache: 'no-store' });
      if (hostRes.ok) {
        const j = (await hostRes.json()) as { data?: MeetingHost };
        setHost(j.data ?? null);
      }
    } catch {
      setHostMsg({ kind: 'err', text: 'Error de red.' });
    } finally {
      setSavingHost(false);
    }
  }

  function validateInt(value: string, min: number, max: number): boolean {
    const n = parseInt(value, 10);
    return !isNaN(n) && n >= min && n <= max;
  }

  const settingsValid =
    validateInt(minDays, 0, 365) &&
    validateInt(snoozeDays, 0, 365) &&
    validateInt(maxShows, 1, 99);

  return (
    <section
      className="bg-white p-6"
      style={{ border: '1px solid var(--dh-gray-100)', borderRadius: 'var(--dh-r-lg)' }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Video className="w-5 h-5" style={{ color: 'var(--dh-turquoise-700)' }} />
        <h2 className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
          Reuniones con especialistas
        </h2>
      </div>

      {/* Google connection feedback */}
      {googleParam === 'connected' && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <p className="text-sm text-teal-700">Google conectado correctamente.</p>
        </div>
      )}
      {googleErrorParam && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">
            Error al conectar Google: {decodeURIComponent(googleErrorParam)}.
          </p>
        </div>
      )}

      {loadingSettings ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Modal toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setEnabled((p) => !p)}
                className={[
                  'relative w-10 h-5 rounded-full transition-colors cursor-pointer',
                  enabled ? 'bg-teal-500' : 'bg-slate-300',
                ].join(' ')}
                role="switch"
                aria-checked={enabled}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') setEnabled((p) => !p);
                }}
              >
                <span
                  className={[
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </div>
              <span className="text-sm font-semibold text-slate-700">
                Modal «Queremos conocerte» habilitado
              </span>
            </label>
            <p className="text-xs text-slate-400 mt-1 ml-13">
              Controla si el modal de invitación a reunión se muestra a los especialistas.
            </p>
          </div>

          {/* Numeric settings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Días mínimos desde registro
              </label>
              <p className="text-xs text-slate-400 mt-0.5 mb-1.5">
                El modal no aparece antes de este tiempo.
              </p>
              <input
                type="number"
                min={0}
                max={365}
                value={minDays}
                onChange={(e) => setMinDays(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Días de snooze («Ahora no»)
              </label>
              <p className="text-xs text-slate-400 mt-0.5 mb-1.5">
                Cuánto tiempo esperar antes de mostrar de nuevo.
              </p>
              <input
                type="number"
                min={0}
                max={365}
                value={snoozeDays}
                onChange={(e) => setSnoozeDays(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Máximo de veces mostrado
              </label>
              <p className="text-xs text-slate-400 mt-0.5 mb-1.5">
                Después de esto, no vuelve a aparecer (a menos que sea por correo).
              </p>
              <input
                type="number"
                min={1}
                max={99}
                value={maxShows}
                onChange={(e) => setMaxShows(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={savingSettings || !settingsValid}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
            >
              {savingSettings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Guardar configuración
            </button>
            {settingsMsg && (
              <p
                className={[
                  'text-sm',
                  settingsMsg.kind === 'ok' ? 'text-emerald-600' : 'text-red-600',
                ].join(' ')}
              >
                {settingsMsg.text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Divider */}
      <hr className="my-6 border-slate-100" />

      {/* Host configuration */}
      <div className="flex items-center gap-2 mb-4">
        <UserCog className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-700">Anfitrión de las reuniones</h3>
      </div>

      {loadingHost ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Cuenta de Google del anfitrión
            </label>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              El anfitrión debe conectar su cuenta de Google para crear eventos de Google Meet.
            </p>
            <select
              value={selectedAdminId}
              onChange={(e) => setSelectedAdminId(e.target.value)}
              className="w-full max-w-sm px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
            >
              <option value="">— Seleccionar administrador —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name} ({a.email})
                </option>
              ))}
            </select>
          </div>

          {/* Google status for current host */}
          {host && (
            <div className="flex items-center gap-2">
              <div
                className={[
                  'w-2 h-2 rounded-full',
                  host.googleConnected ? 'bg-teal-500' : 'bg-amber-400',
                ].join(' ')}
              />
              <span className="text-sm text-slate-600">
                {host.googleConnected ? (
                  <>
                    <span className="font-semibold text-teal-700">Conectado</span> — Google Meet
                    activo para {host.fullName ?? host.email}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-amber-600">No conectado</span> —{' '}
                    {host.fullName ?? host.email} debe conectar su cuenta
                  </>
                )}
              </span>
            </div>
          )}

          {/* Connect Google button (only visible when a host is selected) */}
          {selectedAdminId && (
            <a
              href="/api/integrations/google/auth?returnTo=/admin/settings"
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Link2 className="w-4 h-4 text-teal-500" />
              Conectar Google (anfitrión)
            </a>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveHost()}
              disabled={savingHost || !selectedAdminId}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
            >
              {savingHost ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Guardar anfitrión
            </button>
            {hostMsg && (
              <p
                className={[
                  'text-sm',
                  hostMsg.kind === 'ok' ? 'text-emerald-600' : 'text-red-600',
                ].join(' ')}
              >
                {hostMsg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Export with Suspense (required for useSearchParams in App Router)
// ---------------------------------------------------------------------------

export function MeetingsSettingsSection() {
  return (
    <Suspense fallback={null}>
      <MeetingsSettingsSectionInner />
    </Suspense>
  );
}
