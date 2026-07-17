'use client';

/**
 * PatientFichaModal.tsx
 *
 * Panel deslizable desde la derecha (drawer) con la ficha completa del paciente.
 * Reemplaza el modal centrado — entra desde la derecha con animación slide-in,
 * overlay semitransparente, sin sacar al doctor de la consulta en curso.
 *
 * Modos:
 *   - Lectura (por defecto): muestra TODOS los campos; los sin dato muestran "Sin registrar".
 *   - Edición: habilita PatientForm pre-llenado con todos los campos clínicos.
 *
 * Action de actualización: updatePatient (PUT /api/patients/:id) desde
 * app/doctor/patients/actions.ts. Ownership validado server-side (anti-IDOR).
 */

import { useEffect, useState, useTransition } from 'react';
import {
  X,
  User,
  Phone,
  MapPin,
  Droplet,
  AlertTriangle,
  Loader2,
  Pencil,
  Hash,
  FileText,
  ArrowRight,
} from 'lucide-react';
import PatientForm, { type PatientFormData } from '@/components/patient/PatientForm';
import { updatePatient, type UpdatePatientInput } from '@/app/doctor/patients/actions';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PatientDetail {
  id?: string;
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

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const SEX_LABELS: Record<string, string> = {
  male: 'Masculino',
  female: 'Femenino',
  other: 'Otro',
};

const NONE = 'Sin registrar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBirthDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Convierte PatientDetail (camelCase del BFF) → PatientFormData (snake_case del form). */
function detailToFormData(p: PatientDetail, patientId: string): PatientFormData {
  return {
    id: patientId,
    full_name: p.fullName ?? '',
    cedula: p.cedula ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    birth_date: p.birthDate ?? '',
    age: p.age ?? null,
    sex: (p.sex as PatientFormData['sex']) ?? '',
    blood_type: p.bloodType ?? '',
    address: p.address ?? '',
    city: p.city ?? '',
    allergies: p.allergies ?? '',
    chronic_conditions: p.chronicConditions ?? '',
    emergency_contact_name: p.emergencyContactName ?? '',
    emergency_contact_phone: p.emergencyContactPhone ?? '',
    emergency_contact_relationship: p.emergencyContactRelationship ?? '',
    notes: p.notes ?? '',
    source: 'manual',
  };
}

// ---------------------------------------------------------------------------
// Sub-componentes de lectura
// ---------------------------------------------------------------------------

function ReadField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  const isEmpty = !value;
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</span>
      <span
        className={`text-xs font-semibold text-right leading-relaxed ${
          isEmpty ? 'text-slate-300 italic' : mono ? 'font-mono text-slate-800' : 'text-slate-800'
        }`}
      >
        {isEmpty ? NONE : value}
      </span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-2 border-b border-slate-100 mb-1">
      <Icon className="w-3.5 h-3.5 text-teal-600" />
      <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600">{title}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PatientFichaModal({ patientId, patientName, onClose }: Props) {
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Animación de cierre: slide-out antes de desmontar.
  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 280);
  }

  // Slide-in: montar primero, luego activar la clase de transformación.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Cerrar con Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setVisible(false);
        setTimeout(onClose, 280);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Carga inicial del paciente.
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

  // Guardar cambios desde el formulario de edición.
  async function handleSave(formData: PatientFormData) {
    const input: UpdatePatientInput = {
      full_name: formData.full_name || undefined,
      cedula: formData.cedula ?? null,
      email: formData.email ?? null,
      phone: formData.phone ?? null,
      birth_date: formData.birth_date ?? null,
      age: formData.age ?? null,
      sex: formData.sex ?? null,
      blood_type: formData.blood_type ?? null,
      address: formData.address ?? null,
      city: formData.city ?? null,
      allergies: formData.allergies ?? null,
      chronic_conditions: formData.chronic_conditions ?? null,
      emergency_contact_name: formData.emergency_contact_name ?? null,
      emergency_contact_phone: formData.emergency_contact_phone ?? null,
      emergency_contact_relationship: formData.emergency_contact_relationship ?? null,
      notes: formData.notes ?? null,
    };

    startTransition(async () => {
      // _doctorId es ignorado por el backend (anti-IDOR), pasamos string vacío.
      // try/catch OBLIGATORIO: `updatePatient` es un Server Action y puede LANZAR
      // (no solo devolver {success:false}) — p.ej. "Server Action not found" cuando el
      // cliente quedó viejo tras un deploy (los IDs de action se rehashean, ADR-022), o
      // un error de red/serialización. Sin este catch, el throw escalaba al error boundary
      // raíz ("Error inesperado") y sacaba al usuario a la landing.
      let result: Awaited<ReturnType<typeof updatePatient>>;
      try {
        result = await updatePatient(patientId, '', input);
      } catch {
        showToast({
          type: 'error',
          message:
            'No se pudo guardar. Si actualizamos la app hace poco, recarga la página e intenta de nuevo.',
        });
        return;
      }
      if (!result.success) {
        showToast({ type: 'error', message: result.error ?? 'Error al guardar la ficha' });
        return;
      }

      // Actualizar el estado local con los nuevos valores para que la vista
      // de lectura refleje los cambios sin necesidad de recargar.
      setPatient((prev) => ({
        ...prev,
        fullName: formData.full_name,
        cedula: formData.cedula ?? null,
        email: formData.email ?? null,
        phone: formData.phone ?? null,
        birthDate: formData.birth_date ?? null,
        age: formData.age ?? null,
        sex: formData.sex ?? null,
        bloodType: formData.blood_type ?? null,
        address: formData.address ?? null,
        city: formData.city ?? null,
        allergies: formData.allergies ?? null,
        chronicConditions: formData.chronic_conditions ?? null,
        emergencyContactName: formData.emergency_contact_name ?? null,
        emergencyContactPhone: formData.emergency_contact_phone ?? null,
        emergencyContactRelationship: formData.emergency_contact_relationship ?? null,
        notes: formData.notes ?? null,
      }));

      setEditMode(false);
      showToast({ type: 'success', message: 'Ficha actualizada correctamente' });
    });
  }

  // Valores derivados para vista de lectura.
  const sexLabel = patient?.sex ? (SEX_LABELS[patient.sex] ?? patient.sex) : null;
  const ageLabel = patient?.age != null ? `${patient.age} años` : null;
  const birthLabel = patient?.birthDate ? formatBirthDate(patient.birthDate) : null;
  const birthAndAge =
    birthLabel && ageLabel ? `${birthLabel} (${ageLabel})` : (birthLabel ?? ageLabel ?? null);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[99] bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ficha del paciente"
        className={`fixed top-0 right-0 z-[100] h-full w-full max-w-md bg-white shadow-2xl flex flex-col
          transition-transform duration-300 ease-out
          ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate text-sm">
              {patient?.fullName ?? patientName ?? 'Paciente'}
            </p>
            <p className="text-xs text-slate-400">Ficha del paciente</p>
          </div>

          {/* Botón editar — solo cuando hay datos y no estamos en modo edición */}
          {!loading && !error && patient && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-teal-300 hover:text-teal-700 transition-all shrink-0"
            >
              <Pencil className="w-3 h-3" /> Editar
            </button>
          )}

          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0"
            aria-label="Cerrar ficha"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Estado: cargando */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Cargando ficha…</span>
            </div>
          )}

          {/* Estado: error */}
          {!loading && error && (
            <p className="text-sm text-red-600 py-12 text-center px-5">{error}</p>
          )}

          {/* ── MODO EDICIÓN ── */}
          {!loading && patient && editMode && (
            <div className="p-5">
              <div className="mb-4 flex items-center gap-2 text-xs text-slate-500 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                <Pencil className="w-3 h-3 text-teal-600 shrink-0" />
                Editando ficha — los cambios quedarán guardados en la historia del paciente.
              </div>
              <PatientForm
                initialData={detailToFormData(patient, patientId)}
                onSubmit={handleSave}
                onCancel={() => setEditMode(false)}
                submitting={isPending}
                submitLabel="Guardar cambios"
              />
            </div>
          )}

          {/* ── MODO LECTURA ── */}
          {!loading && patient && !editMode && (
            <div className="p-5 space-y-5">
              {/* Identidad */}
              <section>
                <SectionHeader icon={Hash} title="Identidad" />
                <ReadField label="Nombre completo" value={patient.fullName} />
                <ReadField label="Cédula" value={patient.cedula} mono />
                <ReadField label="Fecha de nac. / Edad" value={birthAndAge} />
                <ReadField label="Sexo" value={sexLabel} />
              </section>

              {/* Contacto */}
              <section>
                <SectionHeader icon={Phone} title="Contacto" />
                <ReadField label="Teléfono" value={patient.phone} mono />
                <ReadField label="Correo electrónico" value={patient.email} />
              </section>

              {/* Ubicación */}
              <section>
                <SectionHeader icon={MapPin} title="Ubicación" />
                <ReadField label="Dirección" value={patient.address} />
                <ReadField label="Ciudad" value={patient.city} />
              </section>

              {/* Datos clínicos */}
              <section>
                <SectionHeader icon={Droplet} title="Datos clínicos" />
                <ReadField label="Tipo de sangre" value={patient.bloodType} />
                <ReadField label="Alergias" value={patient.allergies} />
                <ReadField label="Antecedentes / Crónicas" value={patient.chronicConditions} />
              </section>

              {/* Contacto de emergencia */}
              <section>
                <SectionHeader icon={AlertTriangle} title="Contacto de emergencia" />
                <ReadField label="Nombre" value={patient.emergencyContactName} />
                <ReadField label="Parentesco" value={patient.emergencyContactRelationship} />
                <ReadField label="Teléfono" value={patient.emergencyContactPhone} mono />
              </section>

              {/* Notas */}
              <section>
                <SectionHeader icon={FileText} title="Notas" />
                {patient.notes ? (
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {patient.notes}
                  </p>
                ) : (
                  <p className="text-xs italic text-slate-300">{NONE}</p>
                )}
              </section>

              {/* Enlace a ficha completa */}
              <a
                href={`/doctor/patients?open=${patientId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors"
              >
                Abrir ficha completa en nueva pestaña
                <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
