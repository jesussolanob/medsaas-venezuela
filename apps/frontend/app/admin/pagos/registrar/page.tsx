'use client';

/**
 * /admin/pagos/registrar — Registrar pago de doctor (super admin)
 *
 * Registra MANUALMENTE un pago de suscripción de un doctor (efectivo / transferencia
 * directa que el admin recibe fuera de la app). Al guardar, el backend crea el pago
 * como APROBADO y extiende la suscripción del doctor por los meses indicados.
 *
 * No confundir con "Aprobaciones" (revisar comprobantes que suben los doctores).
 */

import { useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2 } from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

type DoctorOption = {
  doctor_id: string;
  doctor_name: string;
  doctor_email: string;
  plan: string | null;
};

const PAYMENT_METHODS = [
  'Transferencia',
  'Pago Móvil',
  'Zelle',
  'Binance',
  'Efectivo USD',
  'Efectivo Bs',
  'POS',
  'Otro',
];

const MIN_MONTHS = 1;
const MAX_MONTHS = 36;

export default function RegisterPaymentPage() {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  const [doctorId, setDoctorId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [months, setMonths] = useState('1');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/subscriptions');
        const j = await r.json();
        if (!cancelled && r.ok) setDoctors(j.doctors || []);
      } catch {
        if (!cancelled)
          showToast({ type: 'error', message: 'No se pudo cargar la lista de médicos.' });
      } finally {
        if (!cancelled) setLoadingDoctors(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const amountNum = Number(amount);
  const monthsNum = Number(months);
  const valid = useMemo(
    () =>
      doctorId !== '' &&
      Number.isFinite(amountNum) &&
      amountNum > 0 &&
      Number.isInteger(monthsNum) &&
      monthsNum >= MIN_MONTHS &&
      monthsNum <= MAX_MONTHS &&
      method.trim() !== '',
    [doctorId, amountNum, monthsNum, method],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;

    const doctor = doctors.find((d) => d.doctor_id === doctorId);
    setSubmitting(true);
    try {
      const r = await fetch('/api/admin/subscription-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: doctorId,
          amount_usd: amountNum,
          method,
          duration_months: monthsNum,
          reference_number: reference.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo registrar el pago.');

      showToast({
        type: 'success',
        message: `Pago registrado. Suscripción de ${doctor?.doctor_name ?? 'el médico'} extendida ${monthsNum} mes${monthsNum > 1 ? 'es' : ''}.`,
      });
      // Reset (keep method as a sensible default).
      setDoctorId('');
      setAmount('');
      setMonths('1');
      setReference('');
    } catch (error: unknown) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al registrar el pago.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl">
      <header className="mb-6 flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--dh-r-md)]"
          style={{ background: 'var(--dh-turquoise-50)', color: 'var(--dh-turquoise-700)' }}
        >
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ fontFamily: 'var(--dh-font-display)', color: 'var(--dh-ink)' }}
          >
            Registrar pago
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--dh-gray-600)' }}>
            Registra un pago recibido por fuera de la app. Se aprueba al instante y extiende la
            suscripción del médico.
          </p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-[var(--dh-r-lg)] bg-white p-6"
        style={{ border: '1px solid var(--dh-gray-100)', boxShadow: 'var(--dh-shadow-sm)' }}
      >
        <Field label="Médico">
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            disabled={loadingDoctors}
            className="w-full rounded-[var(--dh-r-md)] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            required
          >
            <option value="" disabled>
              {loadingDoctors ? 'Cargando médicos…' : 'Selecciona un médico…'}
            </option>
            {doctors.map((d) => (
              <option key={d.doctor_id} value={d.doctor_id}>
                {d.doctor_name} — {d.doctor_email}
                {d.plan ? ` (${d.plan})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Monto (USD)">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="30.00"
              className="w-full rounded-[var(--dh-r-md)] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              required
            />
          </Field>

          <Field label="Meses a extender">
            <input
              type="number"
              min={MIN_MONTHS}
              max={MAX_MONTHS}
              step="1"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="w-full rounded-[var(--dh-r-md)] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              required
            />
          </Field>
        </div>

        <Field label="Método de pago">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-[var(--dh-r-md)] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Referencia (opcional)">
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="N° de referencia, últimos dígitos, etc."
            className="w-full rounded-[var(--dh-r-md)] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </Field>

        <button
          type="submit"
          disabled={!valid || submitting}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--dh-r-md)] px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--dh-turquoise-700)' }}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Registrando…' : 'Registrar pago'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium" style={{ color: 'var(--dh-gray-800)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
