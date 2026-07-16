'use client';

import { Loader2 } from 'lucide-react';
import type { PricingPlan, PatientPackageInfo, DoctorOffice } from '../appointment-flow.utils';

type Props = {
  filteredPlans: PricingPlan[];
  loadingPlans: boolean;
  selectedPlan: PricingPlan | null;
  setSelectedPlan: (p: PricingPlan | null) => void;
  packages: PatientPackageInfo[];
  usePackage: string | null;
  setUsePackage: (id: string | null) => void;
  selectedOffice: DoctorOffice | null;
  chiefComplaint: string;
  setChiefComplaint: (v: string) => void;
  confirmServiceTypeStep: () => void;
};

export default function StepServiceType({
  filteredPlans,
  loadingPlans,
  selectedPlan,
  setSelectedPlan,
  packages,
  usePackage,
  setUsePackage,
  selectedOffice,
  chiefComplaint,
  setChiefComplaint,
  confirmServiceTypeStep,
}: Props) {
  const canContinue = !!selectedPlan || !!usePackage;

  return (
    <div className="space-y-4">
      {/* Paquetes activos del paciente */}
      {packages.length > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-violet-800 uppercase tracking-wider">
            Paquete activo
          </p>
          {packages.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="package"
                checked={usePackage === p.id}
                onChange={() => setUsePackage(usePackage === p.id ? null : p.id)}
                className="accent-violet-600"
              />
              <span className="text-sm text-slate-900">
                {p.plan_name} — quedan <strong>{p.total_sessions - p.used_sessions}</strong> de{' '}
                {p.total_sessions} sesiones
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Planes/tipos de consulta */}
      {!usePackage && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
            Tipo de consulta
            {selectedOffice && (
              <span className="ml-1 font-normal normal-case text-slate-400">
                — {selectedOffice.name}
              </span>
            )}
          </p>
          {loadingPlans ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando tipos de consulta...
            </div>
          ) : (
            <div className="grid gap-2 mt-2">
              {filteredPlans.map((plan) => {
                const isSelected = selectedPlan?.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                      isSelected
                        ? 'border-teal-400 bg-teal-50'
                        : 'border-slate-200 bg-white hover:border-teal-300'
                    }`}
                  >
                    <div>
                      <p
                        className={`text-sm font-semibold ${isSelected ? 'text-teal-800' : 'text-slate-800'}`}
                      >
                        {plan.name}
                      </p>
                      {plan.sessions_count > 1 && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {plan.sessions_count} sesiones
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-sm font-bold ${isSelected ? 'text-teal-700' : 'text-slate-700'}`}
                    >
                      ${plan.price_usd}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Motivo de consulta (opcional) */}
      <div>
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
          Motivo de consulta{' '}
          <span className="font-normal normal-case text-slate-400">(opcional)</span>
        </label>
        <textarea
          value={chiefComplaint}
          onChange={(e) => setChiefComplaint(e.target.value)}
          placeholder="¿Qué trae al paciente?"
          rows={2}
          className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={confirmServiceTypeStep}
          disabled={!canContinue}
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}
