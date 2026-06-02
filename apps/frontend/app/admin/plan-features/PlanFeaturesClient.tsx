'use client';

import { useState, useCallback, useMemo } from 'react';
import { Lock, Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react';

interface PlanFeature {
  id: string;
  plan: string;
  feature_key: string;
  feature_label: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PlanFeaturesClientProps {
  initialData: PlanFeature[];
}

const PLANS = [
  { key: 'trial', label: 'Trial', bgColor: 'bg-slate-100', textColor: 'text-slate-700', borderColor: 'border-slate-300' },
  { key: 'basic', label: 'Basic', bgColor: 'bg-blue-100', textColor: 'text-blue-700', borderColor: 'border-blue-300' },
  { key: 'professional', label: 'Professional', bgColor: 'bg-teal-100', textColor: 'text-teal-700', borderColor: 'border-teal-300' },
  { key: 'enterprise', label: 'Enterprise', bgColor: 'bg-violet-100', textColor: 'text-violet-700', borderColor: 'border-violet-300' },
];

const LOCKED_FEATURES = ['dashboard', 'settings'];

export default function PlanFeaturesClient({ initialData }: PlanFeaturesClientProps) {
  const [features, setFeatures] = useState<PlanFeature[]>(initialData);
  const [savedFeatures, setSavedFeatures] = useState<PlanFeature[]>(initialData);
  const [loading, setLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Track if there are unsaved changes
  const hasChanges = useMemo(() => {
    return features.some((f) => {
      const saved = savedFeatures.find((s) => s.id === f.id);
      return saved && saved.enabled !== f.enabled;
    });
  }, [features, savedFeatures]);

  // Count changed features
  const changesCount = useMemo(() => {
    return features.filter((f) => {
      const saved = savedFeatures.find((s) => s.id === f.id);
      return saved && saved.enabled !== f.enabled;
    }).length;
  }, [features, savedFeatures]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Toggle locally without saving to API
  const handleToggle = useCallback(
    (featureId: string, _plan: string, feature_key: string, currentEnabled: boolean) => {
      if (LOCKED_FEATURES.includes(feature_key)) return;
      setFeatures((prev) =>
        prev.map((f) => (f.id === featureId ? { ...f, enabled: !currentEnabled } : f))
      );
    },
    []
  );

  // Save all changes to API
  const saveAllChanges = useCallback(async () => {
    const changed = features.filter((f) => {
      const saved = savedFeatures.find((s) => s.id === f.id);
      return saved && saved.enabled !== f.enabled;
    });

    if (changed.length === 0) return;

    setSaving(true);
    let errorCount = 0;

    for (const feature of changed) {
      try {
        const response = await fetch('/api/admin/plan-features', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: feature.plan,
            feature_key: feature.feature_key,
            enabled: feature.enabled,
          }),
        });
        if (!response.ok) errorCount++;
      } catch {
        errorCount++;
      }
    }

    if (errorCount === 0) {
      setSavedFeatures([...features]);
      showToast('success', `${changed.length} cambio${changed.length > 1 ? 's' : ''} guardado${changed.length > 1 ? 's' : ''} exitosamente`);
    } else {
      showToast('error', `Error al guardar ${errorCount} de ${changed.length} cambios`);
    }

    setSaving(false);
  }, [features, savedFeatures]);

  // Group features by plan
  const featuresByPlan = PLANS.reduce(
    (acc, plan) => {
      acc[plan.key] = features.filter((f) => f.plan === plan.key);
      return acc;
    },
    {} as Record<string, PlanFeature[]>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Módulos por Plan</h1>
            <p className="text-slate-600 mt-2">Administra los módulos habilitados para cada plan de suscripción</p>
          </div>
          {hasChanges && (
            <button
              onClick={saveAllChanges}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span className="text-sm font-medium">Guardar cambios ({changesCount})</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Plan Header */}
              <div className={`${plan.bgColor} ${plan.textColor} p-4 border-b ${plan.borderColor}`}>
                <h2 className="font-semibold text-lg">{plan.label}</h2>
              </div>

              {/* Features List */}
              <div className="divide-y divide-slate-200">
                {featuresByPlan[plan.key] && featuresByPlan[plan.key].length > 0 ? (
                  featuresByPlan[plan.key].map((feature) => {
                    const isLocked = LOCKED_FEATURES.includes(feature.feature_key);
                    const isLoading = loading === feature.id;

                    return (
                      <div
                        key={feature.id}
                        className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {isLocked && <Lock className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                          <label className="text-sm text-slate-700 truncate cursor-pointer flex-1">
                            {feature.feature_label}
                          </label>
                        </div>

                        {/* Toggle Switch */}
                        <div className="flex-shrink-0">
                          {isLoading ? (
                            <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
                          ) : (
                            <button
                              onClick={() =>
                                handleToggle(
                                  feature.id,
                                  plan.key,
                                  feature.feature_key,
                                  feature.enabled
                                )
                              }
                              disabled={isLocked || isLoading}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                feature.enabled
                                  ? 'bg-teal-500'
                                  : isLocked
                                  ? 'bg-slate-200 cursor-not-allowed'
                                  : 'bg-slate-300'
                              } ${isLocked ? 'opacity-60' : ''}`}
                              aria-label={`Toggle ${feature.feature_label}`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  feature.enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-sm text-slate-500 text-center py-8">
                    No features configured
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Legend</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-teal-500 rounded-full"></div>
              <span className="text-sm text-slate-600">Feature enabled for plan</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-slate-300 rounded-full"></div>
              <span className="text-sm text-slate-600">Feature disabled for plan</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-600">Locked feature (always enabled)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg flex items-center gap-2 shadow-lg text-white ${
            toast.type === 'success' ? 'bg-teal-500' : 'bg-red-500'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
