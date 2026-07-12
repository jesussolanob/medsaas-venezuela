'use client';

/**
 * PatientFichaModal.tsx
 *
 * Ventana emergente (modal) de solo lectura con la ficha del paciente.
 *
 * Se usa dentro de la consulta para "Ver ficha del paciente" SIN sacar al doctor
 * de la consulta en curso. Carga el detalle vía GET /api/doctor/patients/:id
 * (owner-scoped, PII descifrada para el doctor dueño) al abrir.
 */

import { useEffect, useState } from 'react';
import { X, User, Phone, MapPin, Droplet, AlertTriangle, Loader2 } from 'lucide-react';

interface PatientDetail {
  fullName?: string;
  cedula?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  age?: number | null;
  sex?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  address?: string | null;
  city?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  notes?: string | null;
}

interface Props {
  patientId: string;
  patientName?: string;
  onClose: () => void;
}

const SEX_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
};

function formatBirthDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}

export default function PatientFichaModal({ patientId, patientName, onClose }: Props) {
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/doctor/patients/${patientId}`, { cache: 'no-store' });
        const json = (await res.json().catch(() => null)) as { data?: PatientDetail } | null;
        if (!active) return;
        if (!res.ok || !json?.data) {
          setError('No se pudo cargar la ficha del paciente');
        } else {
          setPatient(json.data);
        }
      } catch {
        if (active) setError('No se pudo cargar la ficha del paciente');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId]);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sexLabel = patient?.sex ? (SEX_LABELS[patient.sex] ?? patient.sex) : null;
  const ageLabel =
    patient?.age != null ? `${patient.age} años` : patient?.birthDate ? undefined : null;
  const birthLabel = patient?.birthDate ? formatBirthDate(patient.birthDate) : null;
  const hasClinical = !!(patient?.bloodType || patient?.allergies || patient?.chronicConditions);
  const hasEmergency = !!(
    patient?.emergencyContactName ||
    patient?.emergencyContactPhone ||
    patient?.emergencyContactRelationship
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Ficha del paciente"
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="w-11 h-11 rounded-xl g-bg flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate">
              {patient?.fullName ?? patientName ?? 'Paciente'}
            </p>
            <p className="text-xs text-slate-400">Ficha del paciente</p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando ficha...</span>
            </div>
          )}

          {!loading && error && <p className="text-sm text-red-600 py-8 text-center">{error}</p>}

          {!loading && patient && (
            <div className="space-y-4">
              {/* Identidad */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1">
                  Identidad
                </p>
                <div className="divide-y divide-slate-50">
                  <Field label="Cédula" value={patient.cedula} />
                  <Field label="Edad" value={ageLabel} />
                  <Field label="Fecha de nacimiento" value={birthLabel} />
                  <Field label="Sexo" value={sexLabel} />
                </div>
              </section>

              {/* Contacto */}
              {(patient.phone || patient.email || patient.address || patient.city) && (
                <section>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Contacto
                  </p>
                  <div className="divide-y divide-slate-50">
                    <Field label="Teléfono" value={patient.phone} />
                    <Field label="Correo" value={patient.email} />
                    <Field label="Dirección" value={patient.address} />
                    <Field label="Ciudad" value={patient.city} />
                  </div>
                </section>
              )}

              {/* Datos clínicos */}
              {hasClinical && (
                <section>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1 flex items-center gap-1">
                    <Droplet className="w-3 h-3" /> Datos clínicos
                  </p>
                  <div className="divide-y divide-slate-50">
                    <Field label="Tipo de sangre" value={patient.bloodType} />
                    <Field label="Alergias" value={patient.allergies} />
                    <Field label="Condiciones crónicas" value={patient.chronicConditions} />
                  </div>
                </section>
              )}

              {/* Contacto de emergencia */}
              {hasEmergency && (
                <section>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Contacto de emergencia
                  </p>
                  <div className="divide-y divide-slate-50">
                    <Field label="Nombre" value={patient.emergencyContactName} />
                    <Field label="Teléfono" value={patient.emergencyContactPhone} />
                    <Field label="Parentesco" value={patient.emergencyContactRelationship} />
                  </div>
                </section>
              )}

              {/* Notas */}
              {patient.notes && (
                <section>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1">
                    Notas
                  </p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{patient.notes}</p>
                </section>
              )}

              {/* Enlace a la ficha completa (nueva pestaña, no saca de la consulta) */}
              <a
                href={`/doctor/patients?open=${patientId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700"
              >
                Abrir ficha completa en otra pestaña
                <MapPin className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
