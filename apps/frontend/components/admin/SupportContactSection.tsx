'use client';

/**
 * SupportContactSection — admin settings sub-section for support contact config.
 *
 * Manages:
 *   - support_whatsapp_number: digits-only WhatsApp number shown on all specialist
 *     support screens and the landing page.
 *   - support_hours: JSON object with days (ISO 1–7), start/end times, and timezone.
 *     Determines when "Llámame ya" is available.
 *
 * Extracted from app/admin/settings/page.tsx (2026-10-30) to keep that file
 * under 800 lines.
 */

import { useEffect, useState } from 'react';
import { Settings2, Loader2, Save } from 'lucide-react';

interface SupportHours {
  days: number[];
  start: string;
  end: string;
  timezone: string;
}

export function SupportContactSection() {
  const [whatsapp, setWhatsapp] = useState('');
  const [hours, setHours] = useState<SupportHours>({
    days: [1, 2, 3, 4, 5, 6],
    start: '08:00',
    end: '18:00',
    timezone: 'America/Caracas',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  // ISO 1–7 (Mon=1 … Sun=7)
  const DAY_ISO = [7, 1, 2, 3, 4, 5, 6]; // maps index [0..6] → ISO day

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/settings', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Array<{ key: string; value: string }> };
        if (cancelled) return;
        const rows = json.data ?? [];
        const wa = rows.find((r) => r.key === 'support_whatsapp_number')?.value ?? '';
        const hoursRaw = rows.find((r) => r.key === 'support_hours')?.value ?? '';
        if (wa) setWhatsapp(wa);
        if (hoursRaw) {
          try {
            const parsed = JSON.parse(hoursRaw) as {
              days?: number[];
              start?: string;
              end?: string;
              timezone?: string;
            };
            setHours({
              days: parsed.days ?? [1, 2, 3, 4, 5, 6],
              start: parsed.start ?? '08:00',
              end: parsed.end ?? '18:00',
              timezone: parsed.timezone ?? 'America/Caracas',
            });
          } catch {
            // keep defaults
          }
        }
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSetting(key: string, value: string) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setMsg({ kind: 'err', text: j.error ?? 'Error al guardar' });
        return;
      }
      setMsg({ kind: 'ok', text: 'Guardado correctamente' });
    } catch {
      setMsg({ kind: 'err', text: 'Error de red' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWhatsapp() {
    const digits = whatsapp.replace(/\D/g, '');
    await saveSetting('support_whatsapp_number', digits);
  }

  async function handleSaveHours() {
    await saveSetting('support_hours', JSON.stringify(hours));
  }

  function toggleDay(isoDay: number) {
    setHours((prev) => ({
      ...prev,
      days: prev.days.includes(isoDay)
        ? prev.days.filter((d) => d !== isoDay)
        : [...prev.days, isoDay].sort((a, b) => a - b),
    }));
  }

  const digitsOnly = whatsapp.replace(/\D/g, '');
  const previewFormatted = digitsOnly.startsWith('58')
    ? `+${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 5)} ${digitsOnly.slice(5, 8)} ${digitsOnly.slice(8)}`
    : digitsOnly;

  return (
    <section
      className="bg-white p-6"
      style={{ border: '1px solid var(--dh-gray-100)', borderRadius: 'var(--dh-r-lg)' }}
    >
      <div className="flex items-center gap-2 mb-5">
        <Settings2 className="w-5 h-5" style={{ color: 'var(--dh-turquoise-700)' }} />
        <h2 className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
          Contacto y soporte
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando…
        </div>
      ) : (
        <div className="space-y-6">
          {/* WhatsApp number */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Número de soporte WhatsApp
            </label>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              Solo dígitos con código de país (sin + ni espacios). Este número se usa en{' '}
              <strong>todas</strong> las pantallas de soporte del especialista y en el landing.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="584221033582"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none"
                maxLength={15}
              />
              <button
                type="button"
                onClick={() => void handleSaveWhatsapp()}
                disabled={saving || !whatsapp}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Guardar
              </button>
            </div>
            {digitsOnly && (
              <p className="text-xs text-slate-500 mt-1.5">
                Vista previa:{' '}
                <a
                  href={`https://wa.me/${digitsOnly}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-600 hover:underline font-mono"
                >
                  +{previewFormatted.trimStart()}
                </a>
              </p>
            )}
          </div>

          {/* Support hours */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Horario de atención
            </label>
            <p className="text-xs text-slate-400 mt-0.5 mb-3">
              Define cuándo el equipo puede hacer llamadas inmediatas («Llámame ya»). Fuera de este
              horario se oculta esa opción y el compromiso cambia.
            </p>

            {/* Day checkboxes (Sun=7,Mon=1…Sat=6 ISO 1-7) */}
            <div className="flex flex-wrap gap-2 mb-3">
              {DAY_LABELS.map((label, idx) => {
                const iso = DAY_ISO[idx];
                const active = hours.days.includes(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggleDay(iso)}
                    className={[
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      active
                        ? 'bg-teal-500 text-white border-teal-500'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Start/end time */}
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                  Desde
                </label>
                <input
                  type="time"
                  value={hours.start}
                  onChange={(e) => setHours((p) => ({ ...p, start: e.target.value }))}
                  className="block mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                  Hasta
                </label>
                <input
                  type="time"
                  value={hours.end}
                  onChange={(e) => setHours((p) => ({ ...p, end: e.target.value }))}
                  className="block mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div className="self-end pb-0.5">
                <button
                  type="button"
                  onClick={() => void handleSaveHours()}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-500 text-white text-sm rounded-lg hover:bg-teal-600 disabled:opacity-60 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Guardar horario
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Hora de Caracas (UTC−4, sin cambio horario).
            </p>
          </div>

          {/* Feedback */}
          {msg && (
            <p
              className={['text-sm', msg.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'].join(
                ' ',
              )}
            >
              {msg.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
