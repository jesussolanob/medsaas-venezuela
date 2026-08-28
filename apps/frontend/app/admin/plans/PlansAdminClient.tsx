'use client';

/**
 * PlansAdminClient — editor completo y parametrizable de planes de suscripción.
 * Panel admin (super_admin): crear/editar plan, editar features y precios.
 */

import { useState, useCallback, useTransition } from 'react';
import {
  Plus,
  Pencil,
  Save,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Zap,
  Package,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toaster';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

interface PlanFeature {
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

interface PlanPrice {
  period: Period;
  price_usd: number;
  /**
   * Precio de referencia que se muestra TACHADO al lado del real en la tabla de
   * planes. null = sin promoción. El backend rechaza un valor menor o igual al
   * precio real: un tachado más barato es un error de carga, no una oferta.
   */
  compare_at_price: number | null;
  is_active: boolean;
}

interface Plan {
  plan_key: string;
  name: string;
  role_key: string;
  is_active: boolean;
  is_permanent: boolean;
  sort_order: number;
  description: string | null;
  price_usd: number;
  trial_days: number;
  features: PlanFeature[];
  prices: PlanPrice[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

const ALL_PERIODS: Period[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

const LOCKED_FEATURES = new Set(['dashboard', 'settings']);

// ─── Sub-components ──────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/30 ${
        checked ? 'bg-teal-500' : 'bg-slate-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function PlanBadge({ planKey, isActive }: { planKey: string; isActive: boolean }) {
  const colorMap: Record<string, string> = {
    delta_free: 'bg-slate-100 text-slate-700',
    delta_base: 'bg-blue-100 text-blue-700',
    delta_plus: 'bg-teal-100 text-teal-700',
    trial: 'bg-amber-100 text-amber-700',
  };
  const color = colorMap[planKey] ?? 'bg-violet-100 text-violet-700';
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}
    >
      {!isActive && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />}
      {planKey}
    </span>
  );
}

// ─── Plan form (create / edit) ────────────────────────────────────────────────

interface PlanFormData {
  plan_key: string;
  name: string;
  role_key: string;
  is_permanent: boolean;
  is_active: boolean;
  sort_order: number;
  description: string;
}

function PlanForm({
  initial,
  onSave,
  onCancel,
  isCreate,
}: {
  initial: PlanFormData;
  onSave: (data: PlanFormData) => Promise<void>;
  onCancel: () => void;
  isCreate: boolean;
}) {
  const [data, setData] = useState<PlanFormData>(initial);
  const [isPending, startTransition] = useTransition();

  function set(key: keyof PlanFormData, value: PlanFormData[keyof PlanFormData]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      void onSave(data);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Clave del plan <span className="text-red-400">*</span>
          </label>
          <input
            value={data.plan_key}
            onChange={(e) => set('plan_key', e.target.value)}
            disabled={!isCreate}
            placeholder="ej: delta_plus"
            required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 disabled:bg-slate-50 disabled:text-slate-400 font-mono"
          />
          {isCreate && (
            <p className="text-[10px] text-slate-400 mt-1">
              Inmutable después de crear. Usar snake_case.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Nombre <span className="text-red-400">*</span>
          </label>
          <input
            value={data.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ej: Delta Plus"
            required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            Rol destino <span className="text-red-400">*</span>
          </label>
          <select
            value={data.role_key}
            onChange={(e) => set('role_key', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white"
          >
            <option value="doctor">doctor</option>
            <option value="assistant">assistant</option>
            <option value="super_admin">super_admin</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Orden</label>
          <input
            type="number"
            value={data.sort_order}
            onChange={(e) => set('sort_order', parseInt(e.target.value) || 0)}
            min={0}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <ToggleSwitch checked={data.is_active} onChange={(v) => set('is_active', v)} />
          <span className="text-sm text-slate-700">Activo</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <ToggleSwitch checked={data.is_permanent} onChange={(v) => set('is_permanent', v)} />
          <span className="text-sm text-slate-700">Permanente (sin expiración)</span>
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isCreate ? 'Crear plan' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

// ─── Features editor ─────────────────────────────────────────────────────────

function FeaturesEditor({
  planKey,
  features,
  onSaved,
}: {
  planKey: string;
  features: PlanFeature[];
  onSaved: (planKey: string, features: PlanFeature[]) => void;
}) {
  const [local, setLocal] = useState<PlanFeature[]>(features);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasChanges =
    JSON.stringify(local.map((f) => ({ k: f.feature_key, e: f.enabled }))) !==
    JSON.stringify(features.map((f) => ({ k: f.feature_key, e: f.enabled })));

  function toggle(featureKey: string) {
    if (LOCKED_FEATURES.has(featureKey)) return;
    setLocal((prev) =>
      prev.map((f) => (f.feature_key === featureKey ? { ...f, enabled: !f.enabled } : f)),
    );
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/plans/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planKey,
          features: local.map(({ feature_key, feature_label, enabled }) => ({
            feature_key,
            feature_label,
            enabled,
          })),
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? 'Error guardando features');
      }
      showToast({ type: 'success', message: 'Features del plan guardadas' });
      onSaved(planKey, local);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Error desconocido';
      setError(errMsg);
      showToast({ type: 'error', message: errMsg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {local.map((f) => {
          const locked = LOCKED_FEATURES.has(f.feature_key);
          return (
            <div key={f.feature_key} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {locked ? (
                  <Lock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                ) : (
                  <Unlock className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                )}
                <span className="text-sm text-slate-700 truncate">{f.feature_label}</span>
                <span className="text-[10px] text-slate-400 font-mono shrink-0">
                  {f.feature_key}
                </span>
              </div>
              <ToggleSwitch
                checked={f.enabled}
                onChange={() => toggle(f.feature_key)}
                disabled={locked}
              />
            </div>
          );
        })}
      </div>
      {local.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">Sin features configuradas.</p>
      )}
      {hasChanges && (
        <div className="flex justify-end pt-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar features
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Prices editor ────────────────────────────────────────────────────────────

function PricesEditor({
  planKey,
  prices,
  onSaved,
}: {
  planKey: string;
  prices: PlanPrice[];
  onSaved: (planKey: string, prices: PlanPrice[]) => void;
}) {
  // Build a complete set for all periods using existing data or defaults
  const [local, setLocal] = useState<PlanPrice[]>(() => {
    return ALL_PERIODS.map((period) => {
      const existing = prices.find((p) => p.period === period);
      return existing ?? { period, price_usd: 0, compare_at_price: null, is_active: false };
    });
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasChanges =
    JSON.stringify(local) !==
    JSON.stringify(
      ALL_PERIODS.map((period) => {
        const existing = prices.find((p) => p.period === period);
        return existing ?? { period, price_usd: 0, compare_at_price: null, is_active: false };
      }),
    );

  function updatePrice(period: Period, field: 'price_usd' | 'is_active', value: number | boolean) {
    setLocal((prev) => prev.map((p) => (p.period === period ? { ...p, [field]: value } : p)));
  }

  /** El campo vacío se guarda como null = sin promoción, y deja de tacharse. */
  function updateCompareAt(period: Period, raw: string) {
    const value = raw.trim() === '' ? null : parseFloat(raw);
    setLocal((prev) =>
      prev.map((p) =>
        p.period === period
          ? { ...p, compare_at_price: value !== null && Number.isFinite(value) ? value : null }
          : p,
      ),
    );
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/plans/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey, prices: local }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? 'Error guardando precios');
      }
      showToast({ type: 'success', message: 'Precios del plan guardados' });
      onSaved(planKey, local);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Error desconocido';
      setError(errMsg);
      showToast({ type: 'error', message: errMsg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
      <div className="space-y-2">
        {local.map((price) => (
          <div
            key={price.period}
            className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg bg-slate-50/60"
          >
            <ToggleSwitch
              checked={price.is_active}
              onChange={(v) => updatePrice(price.period as Period, 'is_active', v)}
            />
            <span className="text-sm font-medium text-slate-700 w-24 shrink-0">
              {PERIOD_LABELS[price.period as Period] ?? price.period}
            </span>
            <div className="relative flex-1 max-w-[160px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                $
              </span>
              <input
                type="number"
                value={price.price_usd}
                onChange={(e) =>
                  updatePrice(price.period as Period, 'price_usd', parseFloat(e.target.value) || 0)
                }
                min={0}
                step={0.01}
                disabled={!price.is_active}
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
            <span className="text-xs text-slate-400">USD</span>

            <div className="relative flex-1 max-w-[150px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm line-through">
                $
              </span>
              <input
                type="number"
                value={price.compare_at_price ?? ''}
                onChange={(e) => updateCompareAt(price.period as Period, e.target.value)}
                min={0}
                step={0.01}
                disabled={!price.is_active}
                placeholder="Sin oferta"
                title="Precio tachado: se muestra al lado del real. Vacío = sin promoción. Tiene que ser mayor al precio real."
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
            {price.compare_at_price !== null && price.compare_at_price <= price.price_usd && (
              <span className="text-[11px] text-red-600 max-w-[150px]">
                El tachado tiene que ser mayor al precio real.
              </span>
            )}
          </div>
        ))}
      </div>
      {hasChanges && (
        <div className="flex justify-end pt-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar precios
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

type PlanTab = 'features' | 'prices';

function PlanCard({
  plan,
  onUpdate,
  onFeaturesUpdate,
  onPricesUpdate,
}: {
  plan: Plan;
  onUpdate: (planKey: string, data: PlanFormData) => Promise<void>;
  onFeaturesUpdate: (planKey: string, features: PlanFeature[]) => void;
  onPricesUpdate: (planKey: string, prices: PlanPrice[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<PlanTab>('features');

  const activePrices = plan.prices.filter((p) => p.is_active);
  const enabledFeatures = plan.features.filter((f) => f.enabled).length;

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden transition-all ${
        plan.is_active ? 'border-slate-200' : 'border-slate-100 opacity-70'
      }`}
    >
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={expanded ? 'Contraer' : 'Expandir'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-slate-800">{plan.name}</h3>
              <PlanBadge planKey={plan.plan_key} isActive={plan.is_active} />
              {plan.is_permanent && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">
                  Permanente
                </span>
              )}
              {!plan.is_active && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                  Inactivo
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {enabledFeatures} features activas
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {activePrices.length > 0
                  ? activePrices
                      .map(
                        (p) => `$${p.price_usd} ${PERIOD_LABELS[p.period as Period] ?? p.period}`,
                      )
                      .join(', ')
                  : 'Sin precios activos'}
              </span>
              <span className="flex items-center gap-1">
                <Package className="w-3 h-3" />
                rol: {plan.role_key}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing((v) => !v);
              setExpanded(true);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            aria-label="Editar plan"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-100">
          {/* Edit form */}
          {editing && (
            <div className="pt-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Editar plan
              </h4>
              <PlanForm
                isCreate={false}
                initial={{
                  plan_key: plan.plan_key,
                  name: plan.name,
                  role_key: plan.role_key,
                  is_permanent: plan.is_permanent,
                  is_active: plan.is_active,
                  sort_order: plan.sort_order,
                  description: plan.description ?? '',
                }}
                onSave={(data) => onUpdate(plan.plan_key, data)}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}

          {/* Tabs: Features / Prices */}
          <div className="pt-2">
            <div className="flex gap-1 mb-4 border-b border-slate-100">
              {(['features', 'prices'] as PlanTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'border-teal-500 text-teal-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab === 'features' ? 'Features' : 'Precios'}
                </button>
              ))}
            </div>

            {activeTab === 'features' && (
              <FeaturesEditor
                planKey={plan.plan_key}
                features={plan.features}
                onSaved={onFeaturesUpdate}
              />
            )}
            {activeTab === 'prices' && (
              <PricesEditor planKey={plan.plan_key} prices={plan.prices} onSaved={onPricesUpdate} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PlansAdminClientProps {
  initialPlans: Plan[];
}

export default function PlansAdminClient({ initialPlans }: PlansAdminClientProps) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [showCreate, setShowCreate] = useState(false);

  const updatePlan = useCallback(async (planKey: string, data: PlanFormData) => {
    try {
      const { plan_key: _ignored, ...rest } = data;
      const res = await fetch('/api/admin/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_key: planKey, ...rest }),
      });
      const json = (await res.json()) as { success?: boolean; data?: Plan; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error actualizando plan');
      if (json.data) {
        setPlans((prev) => prev.map((p) => (p.plan_key === planKey ? { ...p, ...json.data } : p)));
      }
      showToast({ type: 'success', message: `Plan "${data.name}" actualizado` });
    } catch (e: unknown) {
      showToast({ type: 'error', message: e instanceof Error ? e.message : 'Error desconocido' });
      throw e; // re-throw so form stays open
    }
  }, []);

  const createPlan = useCallback(async (data: PlanFormData) => {
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { success?: boolean; data?: Plan; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Error creando plan');
      if (json.data) {
        setPlans((prev) => [...prev, { ...json.data!, features: [], prices: [] }]);
      }
      setShowCreate(false);
      showToast({ type: 'success', message: `Plan "${data.name}" creado` });
    } catch (e: unknown) {
      showToast({ type: 'error', message: e instanceof Error ? e.message : 'Error desconocido' });
      throw e;
    }
  }, []);

  const handleFeaturesUpdate = useCallback((planKey: string, features: PlanFeature[]) => {
    setPlans((prev) => prev.map((p) => (p.plan_key === planKey ? { ...p, features } : p)));
  }, []);

  const handlePricesUpdate = useCallback((planKey: string, prices: PlanPrice[]) => {
    setPlans((prev) => prev.map((p) => (p.plan_key === planKey ? { ...p, prices } : p)));
  }, []);

  const activePlans = plans.filter((p) => p.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-teal-50 text-teal-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Planes de suscripción</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {activePlans} activo{activePlans !== 1 ? 's' : ''} de {plans.length} total
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-500 rounded-lg hover:bg-teal-600 transition-colors shadow-sm"
        >
          {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreate ? 'Cancelar' : 'Nuevo plan'}
        </button>
      </div>

      {/* Create plan form */}
      {showCreate && (
        <div className="bg-white border border-teal-100 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Crear nuevo plan</h2>
          <PlanForm
            isCreate
            initial={{
              plan_key: '',
              name: '',
              role_key: 'doctor',
              is_permanent: false,
              is_active: true,
              sort_order: 99,
              description: '',
            }}
            onSave={createPlan}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Plans list */}
      <div className="space-y-3">
        {plans.length === 0 && (
          <div className="text-center py-16 text-sm text-slate-400">
            No hay planes configurados.
          </div>
        )}
        {plans.map((plan) => (
          <PlanCard
            key={plan.plan_key}
            plan={plan}
            onUpdate={updatePlan}
            onFeaturesUpdate={handleFeaturesUpdate}
            onPricesUpdate={handlePricesUpdate}
          />
        ))}
      </div>
    </div>
  );
}
