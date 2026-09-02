'use client';

/**
 * UpgradeClient — vista de upsell para médicos.
 * Muestra tabla comparativa de planes activos con precios y features.
 * CTA primario: "Pagar este plan" abre el modal de pago en la app.
 * CTA secundario: WhatsApp solo como soporte.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Check,
  X,
  Zap,
  ArrowLeft,
  MessageCircle,
  ChevronRight,
  Star,
  Lock,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  History,
} from 'lucide-react';
import PlanPaymentModal from '@/components/doctor/PlanPaymentModal';
import DeactivateAccountCard from '@/app/doctor/settings/DeactivateAccountCard';

interface PlanFeature {
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

interface PlanPrice {
  period: string;
  price_usd: number;
  /**
   * Precio de referencia que se muestra TACHADO al lado del real. null = sin
   * promoción, y entonces no se pinta nada. El backend ya garantiza que, si
   * viene, es mayor al precio real: un tachado más barato sería un error de carga.
   */
  compare_at_price: number | null;
  is_active: boolean;
}

interface Plan {
  plan_key: string;
  name: string;
  is_active: boolean;
  is_permanent: boolean;
  sort_order: number;
  features: PlanFeature[];
  prices: PlanPrice[];
}

type Period = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

const PERIOD_LABELS: Record<Period, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const PERIOD_MONTHS: Record<Period, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * Fallback labels for feature keys when the backend does not send a feature_label.
 * NOT used as the primary source of truth — backend's feature_label field takes
 * precedence. Add entries here only to avoid showing raw snake_case keys to the user.
 */
const FEATURE_LABELS: Record<string, string> = {
  dashboard: 'Panel principal',
  agenda: 'Agenda',
  patients: 'Pacientes',
  consultations: 'Consultas',
  ehr: 'Historia Clínica',
  finances: 'Finanzas',
  billing: 'Facturación',
  reports: 'Reportes',
  crm: 'CRM',
  reminders: 'Recordatorios',
  messages: 'Mensajes',
  invitations: 'Invitaciones',
  services: 'Servicios',
  settings: 'Configuración',
  ai_assistant: 'Asistente IA',
  ai_transcription: 'Transcripción IA',
  ai_reports: 'Reportes IA',
  inventory: 'Inventario',
  quotes: 'Cotizaciones',
};

const WHATSAPP_NUMBER = '584221033582'; // WhatsApp de soporte Delta Salud (+58 422 103 3582)
const WHATSAPP_MESSAGE = encodeURIComponent(
  'Hola, soy especialista de Delta Salud y tengo una consulta sobre mi plan.',
);

interface PaymentRow {
  id: string;
  plan_key: string;
  period: string;
  amount_usd: number;
  amount_bs: number | null;
  bcv_rate: number | null;
  bank_name: string | null;
  reference_number: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
}

const STATUS_CONFIG = {
  pending: {
    label: 'En revisión',
    icon: Clock,
    color: '#D97706',
    bg: '#FEF3C7',
    border: '#FDE68A',
  },
  approved: {
    label: 'Aprobado',
    icon: CheckCircle2,
    color: '#059669',
    bg: '#D1FAE5',
    border: '#A7F3D0',
  },
  rejected: {
    label: 'Rechazado',
    icon: XCircle,
    color: '#DC2626',
    bg: '#FEE2E2',
    border: '#FECACA',
  },
} as const;

const PERIOD_LABELS_SHORT: Record<string, string> = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  semiannual: 'semestral',
  annual: 'anual',
};

interface ModalState {
  planKey: string;
  planName: string;
  period: Period;
}

interface UpgradeClientProps {
  plans: Plan[];
  /** Plan EFECTIVO actual del doctor — se resalta como "Plan actual". */
  currentPlanKey?: string | null;
}

export default function UpgradeClient({ plans, currentPlanKey }: UpgradeClientProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('monthly');
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const fetchPayments = useCallback(() => {
    setLoadingPayments(true);
    setPaymentsError(null);
    fetch('/api/doctor/subscription-payments')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error al cargar historial');
        setPayments(Array.isArray(j.payments) ? (j.payments as PaymentRow[]) : []);
      })
      .catch((e: unknown) => {
        setPaymentsError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => setLoadingPayments(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  function getPriceForPeriod(plan: Plan, period: Period): number | null {
    const price = plan.prices.find((p) => p.period === period && p.is_active);
    return price ? price.price_usd : null;
  }

  /** Precio tachado del período, si el admin cargó una promoción para ese plan. */
  function getCompareAtForPeriod(plan: Plan, period: Period): number | null {
    const price = plan.prices.find((p) => p.period === period && p.is_active);
    return price?.compare_at_price ?? null;
  }

  // Discount implied by a multi-month period vs paying monthly × N months.
  // The discount is baked into plan_prices (no separate column), so we derive it.
  function getDiscountPct(plan: Plan, period: Period): number | null {
    if (period === 'monthly') return null;
    const monthly = getPriceForPeriod(plan, 'monthly');
    const periodPrice = getPriceForPeriod(plan, period);
    if (monthly == null || periodPrice == null || monthly <= 0) return null;
    const fullPrice = monthly * PERIOD_MONTHS[period];
    if (periodPrice >= fullPrice) return null;
    return Math.round((1 - periodPrice / fullPrice) * 100);
  }

  // Best discount available for a period across all plans (for the period selector).
  function getMaxDiscountForPeriod(period: Period): number | null {
    let max = 0;
    for (const plan of plans) {
      const d = getDiscountPct(plan, period);
      if (d && d > max) max = d;
    }
    return max > 0 ? max : null;
  }

  function isFeatureEnabled(plan: Plan, featureKey: string): boolean {
    const feature = plan.features.find((f) => f.feature_key === featureKey);
    return feature?.enabled ?? false;
  }

  // Derive the feature list entirely from BD data — no hardcoded list.
  // Collect all unique feature_keys from all plans, preserving insertion order
  // (the plan with the most features — typically the top-tier — defines the order).
  // Only include features enabled in at least one plan so purely disabled keys
  // don't pollute the comparison table.
  const seenKeys = new Set<string>();
  const relevantFeatures: Array<{ key: string; label: string }> = [];

  // Sort plans descending by feature count so the most complete plan sets the order.
  const plansByFeatureCount = [...plans].sort(
    (a, b) =>
      b.features.filter((f) => f.enabled).length - a.features.filter((f) => f.enabled).length,
  );

  for (const plan of plansByFeatureCount) {
    for (const feat of plan.features) {
      if (seenKeys.has(feat.feature_key)) continue;
      seenKeys.add(feat.feature_key);
      // Use backend label first, then local fallback, then raw key.
      const label =
        feat.feature_label?.trim() || FEATURE_LABELS[feat.feature_key] || feat.feature_key;
      // Only add to the table if enabled in at least one plan.
      const enabledInAnyPlan = plans.some((p) => isFeatureEnabled(p, feat.feature_key));
      if (enabledInAnyPlan) {
        relevantFeatures.push({ key: feat.feature_key, label });
      }
    }
  }

  // Which periods have at least one active price across plans
  const availablePeriods = (['monthly', 'quarterly', 'semiannual', 'annual'] as Period[]).filter(
    (period) => plans.some((p) => p.prices.some((pr) => pr.period === period && pr.is_active)),
  );

  // Período efectivo: si el elegido no tiene precios en BD, usar el primero
  // disponible (evita "Precio no disponible" cuando sí hay precios en otro período).
  // Valor derivado en vez de setState-en-effect.
  const effectivePeriod: Period = availablePeriods.includes(selectedPeriod)
    ? selectedPeriod
    : (availablePeriods[0] ?? selectedPeriod);

  // Mark the "best value" plan (non-permanent with most features)
  const paidPlans = plans.filter((p) => !p.is_permanent);
  const featuredPlanKey =
    paidPlans.length > 0
      ? paidPlans.reduce((best, p) =>
          p.features.filter((f) => f.enabled).length > best.features.filter((f) => f.enabled).length
            ? p
            : best,
        ).plan_key
      : null;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Back link */}
      <Link
        href="/doctor"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al inicio
      </Link>

      {/* Hero */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
      >
        <div className="px-6 py-8 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-5 h-5 text-white/70" />
            <span className="text-sm font-semibold text-white/80 uppercase tracking-wider">
              Módulo no disponible en tu plan actual
            </span>
          </div>
          <h1 className="text-2xl font-bold mb-2">Mejora tu plan Delta Salud</h1>
          <p className="text-white/80 text-sm max-w-xl">
            Desbloquea todas las herramientas que necesitas para gestionar tu práctica médica. Elige
            tu plan, paga desde aquí y sube tu comprobante: activamos el acceso apenas lo
            verifiquemos.
          </p>
        </div>
      </div>

      {/* Period selector */}
      {availablePeriods.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500 font-medium mr-1">Ciclo de pago:</span>
          {availablePeriods.map((period) => {
            const disc = getMaxDiscountForPeriod(period);
            const isActive = effectivePeriod === period;
            return (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-teal-500 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300'
                }`}
              >
                {PERIOD_LABELS[period]}
                {disc ? (
                  <span
                    className={`ml-1.5 text-[11px] font-bold ${isActive ? 'text-white' : 'text-emerald-600'}`}
                  >
                    -{disc}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const price = getPriceForPeriod(plan, effectivePeriod);
          const isCurrent = currentPlanKey != null && plan.plan_key === currentPlanKey;
          const isFeatured = plan.plan_key === featuredPlanKey;
          const isPermanent = plan.is_permanent;
          const enabledCount = plan.features.filter((f) => f.enabled).length;

          return (
            <div
              key={plan.plan_key}
              className={`relative bg-white rounded-xl overflow-hidden border transition-all ${
                isCurrent
                  ? 'border-teal-500 ring-2 ring-teal-300 shadow-lg shadow-teal-100'
                  : isFeatured
                    ? 'border-teal-400 shadow-lg shadow-teal-100'
                    : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {(isFeatured || isCurrent) && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 to-cyan-500" />
              )}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-bold text-slate-800">{plan.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {enabledCount} módulos incluidos
                    </p>
                  </div>
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-500 text-white text-[10px] font-bold rounded-full">
                      <Check className="w-2.5 h-2.5" />
                      Plan actual
                    </span>
                  ) : (
                    isFeatured && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-full border border-teal-100">
                        <Star className="w-2.5 h-2.5" />
                        Popular
                      </span>
                    )
                  )}
                </div>

                <div className="mb-4">
                  {isPermanent ? (
                    <div>
                      <span className="text-2xl font-bold text-slate-800">Gratis</span>
                      <span className="text-sm text-slate-500 ml-1">para siempre</span>
                    </div>
                  ) : price !== null ? (
                    (() => {
                      const discount = getDiscountPct(plan, effectivePeriod);
                      const months = PERIOD_MONTHS[effectivePeriod];
                      const compareAt = getCompareAtForPeriod(plan, effectivePeriod);
                      return (
                        <div>
                          {compareAt !== null && (
                            <span
                              className="text-base font-semibold text-slate-400 line-through mr-2"
                              aria-label={`Precio anterior ${compareAt} dólares`}
                            >
                              ${compareAt}
                            </span>
                          )}
                          <span className="text-2xl font-bold text-slate-800">${price}</span>
                          <span className="text-sm text-slate-500 ml-1">
                            USD / {PERIOD_LABELS[effectivePeriod]?.toLowerCase()}
                          </span>
                          {discount ? (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-100">
                                Ahorra {discount}%
                              </span>
                              <span className="text-xs text-slate-400">
                                ≈ ${(price / months).toFixed(0)}/mes
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-sm text-slate-400">Precio no disponible</span>
                  )}
                </div>

                {isCurrent ? (
                  <div className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-teal-50 text-teal-700 border border-teal-200 cursor-default">
                    <Check className="w-4 h-4" />
                    Plan actual
                  </div>
                ) : isPermanent ? (
                  <div className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-50 text-slate-400 border border-slate-100 cursor-default">
                    Plan gratuito
                  </div>
                ) : price !== null ? (
                  <button
                    type="button"
                    onClick={() =>
                      setModalState({
                        planKey: plan.plan_key,
                        planName: plan.name,
                        period: effectivePeriod,
                      })
                    }
                    className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      isFeatured
                        ? 'bg-teal-500 text-white hover:bg-teal-600'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    Pagar este plan
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-50 text-slate-400 border border-slate-100 cursor-default">
                    Precio no disponible
                  </div>
                )}
              </div>

              {/* Feature list */}
              <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-2">
                {relevantFeatures.slice(0, 8).map(({ key, label }) => {
                  const enabled = isFeatureEnabled(plan, key);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      {enabled ? (
                        <Check className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                      )}
                      <span className={`text-xs ${enabled ? 'text-slate-700' : 'text-slate-300'}`}>
                        {label}
                      </span>
                    </div>
                  );
                })}
                {relevantFeatures.length > 8 && (
                  <p className="text-[10px] text-slate-400 pt-1">
                    + {relevantFeatures.length - 8} módulos más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full comparison table */}
      {plans.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Zap className="w-4 h-4 text-teal-500" />
              Comparación completa de módulos
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600 w-48">Módulo</th>
                  {plans.map((p) => (
                    <th
                      key={p.plan_key}
                      className={`text-center px-4 py-3 font-semibold w-28 ${
                        p.plan_key === featuredPlanKey ? 'text-teal-700' : 'text-slate-600'
                      }`}
                    >
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {relevantFeatures.map(({ key, label }) => (
                  <tr
                    key={key}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors"
                  >
                    <td className="px-5 py-2.5 text-slate-700">{label}</td>
                    {plans.map((p) => {
                      const enabled = isFeatureEnabled(p, key);
                      return (
                        <td key={p.plan_key} className="text-center px-4 py-2.5">
                          {enabled ? (
                            <Check className="w-4 h-4 text-teal-500 mx-auto" />
                          ) : (
                            <X className="w-4 h-4 text-slate-200 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-teal-500" />
          <h2 className="text-sm font-bold text-slate-800">Historial de pagos</h2>
        </div>

        {loadingPayments ? (
          <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Cargando historial...</span>
          </div>
        ) : paymentsError ? (
          <div className="flex items-center gap-2.5 px-5 py-4 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {paymentsError}
          </div>
        ) : payments.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-400">No tienes pagos registrados aún.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {payments.map((p) => {
              const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = st.icon;
              return (
                <li
                  key={p.id}
                  className="px-5 py-3.5 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {p.plan_key.charAt(0).toUpperCase() + p.plan_key.slice(1)} ·{' '}
                      <span className="font-normal text-slate-500">
                        {PERIOD_LABELS_SHORT[p.period] ?? p.period}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      <span className="text-xs text-slate-500">
                        ${p.amount_usd.toFixed(2)} USD
                        {p.amount_bs !== null ? (
                          <span className="ml-1 text-slate-400">
                            · Bs.{' '}
                            {p.amount_bs.toLocaleString('es-VE', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : null}
                      </span>
                      {p.bank_name && <span className="text-xs text-slate-400">{p.bank_name}</span>}
                      {p.reference_number && (
                        <span className="text-xs text-slate-400 font-mono">
                          #{p.reference_number}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {new Intl.DateTimeFormat('es-VE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(p.created_at))}
                    </p>
                    {p.status === 'rejected' && p.rejection_reason && (
                      <p className="text-[11px] text-red-500 mt-0.5 italic">{p.rejection_reason}</p>
                    )}
                  </div>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
                    style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Secondary support link — la tarjeta ENTERA es el enlace: antes solo la
          palabra "WhatsApp" era clickeable y el resto parecía botón muerto. */}
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl transition-colors hover:bg-green-50 hover:border-green-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
      >
        <MessageCircle className="w-5 h-5 shrink-0 text-green-500" />
        <div>
          <p className="text-sm font-semibold text-slate-700">¿Necesitas ayuda?</p>
          <p className="text-xs text-slate-500">
            Escríbenos por{' '}
            <span className="font-semibold text-green-600 group-hover:underline">WhatsApp</span>{' '}
            para cualquier consulta sobre tu plan.
          </p>
        </div>
        <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-green-600" />
      </a>

      {/*
        Baja de cuenta — última de la página y en gris (pedido del dueño,
        2026-08-19). Vivía al pie de "Mi perfil", donde aparecía mientras el
        especialista hacía su trabajo diario. Acá está donde tiene sentido
        buscarla —la pantalla de lo que paga— sin competir con los planes.
      */}
      <DeactivateAccountCard />

      {/* Payment modal */}
      {modalState && (
        <PlanPaymentModal
          planKey={modalState.planKey}
          planName={modalState.planName}
          period={modalState.period}
          onClose={() => setModalState(null)}
          onSuccess={() => {
            setModalState(null);
            fetchPayments();
          }}
        />
      )}
    </div>
  );
}
