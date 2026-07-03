'use client';

import { Loader2, MapPin } from 'lucide-react';
import type { DoctorOffice } from '../appointment-flow.utils';

type Props = {
  offices: DoctorOffice[];
  loadingOffices: boolean;
  selectedOffice: DoctorOffice | null;
  setSelectedOffice: (o: DoctorOffice | null) => void;
  mode: 'presencial' | 'online';
  setMode: (m: 'presencial' | 'online') => void;
  confirmOfficeStep: () => void;
};

export default function StepOffice({
  offices,
  loadingOffices,
  selectedOffice,
  setSelectedOffice,
  mode,
  setMode,
  confirmOfficeStep,
}: Props) {
  const modality = selectedOffice?.modality;
  const modeIsFixed = modality === 'in_person' || modality === 'online';

  return (
    <div className="space-y-4">
      {/* Selector de consultorio */}
      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
          Consultorio
        </p>
        {loadingOffices ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando consultorios...
          </div>
        ) : offices.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500">
            Sin consultorios configurados —{' '}
            <a href="/doctor/offices" className="text-teal-600 font-semibold underline">
              Agregar consultorio
            </a>
          </div>
        ) : (
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setSelectedOffice(null)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                !selectedOffice
                  ? 'border-teal-400 bg-teal-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <MapPin
                className={`w-4 h-4 shrink-0 ${!selectedOffice ? 'text-teal-600' : 'text-slate-400'}`}
              />
              <div>
                <p
                  className={`text-sm font-semibold ${!selectedOffice ? 'text-teal-800' : 'text-slate-700'}`}
                >
                  Sin consultorio específico
                </p>
                <p className="text-xs text-slate-400">Cualquier modalidad disponible</p>
              </div>
            </button>
            {offices.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedOffice(o)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                  selectedOffice?.id === o.id
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <MapPin
                  className={`w-4 h-4 shrink-0 ${selectedOffice?.id === o.id ? 'text-teal-600' : 'text-slate-400'}`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold ${selectedOffice?.id === o.id ? 'text-teal-800' : 'text-slate-700'}`}
                  >
                    {o.name}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {o.address || ''}
                    {o.modality === 'in_person' && ' · Solo presencial'}
                    {o.modality === 'online' && ' · Solo online'}
                    {o.modality === 'both' && ' · Presencial y online'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selector de modalidad */}
      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
          Modalidad
        </p>
        {modeIsFixed ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600">
            {modality === 'in_person'
              ? 'Presencial (obligatorio para este consultorio)'
              : 'Online (obligatorio para este consultorio)'}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('presencial')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'presencial'
                  ? 'bg-teal-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Presencial
            </button>
            <button
              type="button"
              onClick={() => setMode('online')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'online'
                  ? 'bg-teal-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Online
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end mt-2">
        <button
          onClick={confirmOfficeStep}
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg"
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}
