'use client';

import { useState, useCallback } from 'react';
import { Lock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Toast } from '@/components/ui/toast';

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
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggle = useCallback(
    async (featureId: string, plan: string, feature_key: string, currentEnabled: boolean) => {
      // Don't allow toggling locked features
      if (LOCKED_FEATURES.includes(feature_key)) {
        return;
      }

      setLoading(featureId);

      try {
        const response = await fetch('/api/admin/plan-features', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan,
            feature_key,
            enabled: !currentEnabled,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update feature');
        }

        // Update local state
        setFeatures((prevFeatures) =>
          prevFeatures.map((f) =>
            f.id === featureId ? { ...f, enabled: !currentEnabled } : f
          )
        );

        showToast('success', `Feature ${feature_key} updated successfully`);
      } catch (error) {
        console.error('Error updating feature:', error);
        showToast('error', 'Failed to update feature');
      } finally {
        setLoading(null);
      }
    },
    []
  );

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Módulos por Plan</h1>
          <p className="text-slate-600 mt-2">Manage feature toggles for each subscription plan</p>
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
