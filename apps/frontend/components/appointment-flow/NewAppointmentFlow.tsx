'use client';

/**
 * NewAppointmentFlow — wizard de 5 pasos para crear consultas.
 *
 * Orden de pasos:
 *   1. Paciente  → buscar existente o crear inline
 *   2. Consultorio → seleccionar sede + modalidad (dispara carga de tipos y slots reales)
 *   3. Tipo de consulta → plan/tipo + motivo opcional
 *   4. Horario → slots reales del consultorio (ocupa booked + bloqueados)
 *   5. Método de pago → métodos del médico + "pagar después" + upload comprobante real
 *
 * API pública (no cambiar): Props + AppointmentContext
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCircle,
  CreditCard,
  ExternalLink,
  MapPin,
  Pill,
  User,
  X,
} from 'lucide-react';
import AccordionSection from './AccordionSection';
import { DeltaMark } from '@/components/dh';
import { useAppointmentFlow } from './useAppointmentFlow';
import type { DeferredSessionsContext, AppointmentSuccessResult } from './useAppointmentFlow';
import StepPatient from './steps/StepPatient';
import StepOffice from './steps/StepOffice';
import StepServiceType from './steps/StepServiceType';
import StepSchedule from './steps/StepSchedule';
import StepPayment from './steps/StepPayment';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// SuccessStep — shown after a single-session appointment is created.
// Replaces the immediate close + navigation so the doctor can choose where to go.
// The toast is NOT shown before this step (it would be redundant with this UI).
// ---------------------------------------------------------------------------

function SuccessStep({
  result,
  patientName,
  scheduledAt,
  onGoToConsultation,
  onClose,
}: {
  result: AppointmentSuccessResult;
  patientName: string;
  scheduledAt: string;
  onGoToConsultation: () => void;
  onClose: () => void;
}) {
  const fmtDate = (iso: string) =>
    iso
      ? new Date(iso).toLocaleString('es-VE', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'America/Caracas',
        })
      : '';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Gradient header */}
        <div
          className="px-5 py-4 text-white"
          style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)' }}
        >
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-white/90" />
            <div>
              <h3 className="text-base font-bold">Cita agendada</h3>
              <p className="text-xs text-white/80">Paciente registrado correctamente</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Summary */}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800">{patientName}</p>
            <p className="text-xs text-slate-500">{fmtDate(scheduledAt)}</p>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            {result.consultationId ? (
              <button
                onClick={onGoToConsultation}
                className="w-full flex items-center justify-center gap-2 py-2.5 g-bg rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="w-4 h-4" />
                Ir a la consulta
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeferredSessionsModal
// Shown after a successful multi-session plan appointment when sessions > 1.
// Offers "schedule remaining sessions later" (bulk-create pending-consultations)
// or dismissal (user will schedule on demand from the pending-consultations list).
// ---------------------------------------------------------------------------

function DeferredSessionsModal({
  ctx,
  onClose,
  onDone,
}: {
  ctx: DeferredSessionsContext;
  onClose: () => void;
  onDone: () => void;
}) {
  const deferredCount = ctx.sessionsCount - 1;
  const sessionNumbers = Array.from({ length: deferredCount }, (_, i) => i + 2);
  const [submitting, setSubmitting] = useState(false);

  async function handleDeferLater() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/doctor/pending-consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: ctx.patientId,
          plan_id: ctx.planId,
          session_numbers: sessionNumbers,
          office_id: ctx.officeId ?? null,
          appointment_mode: ctx.appointmentMode,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({
          type: 'error',
          message: json.error ?? 'No se pudieron crear las consultas diferidas',
        });
        return;
      }
      showToast({
        type: 'success',
        message: `${deferredCount} ${deferredCount === 1 ? 'consulta creada' : 'consultas creadas'} en "Consultas por agendar"`,
      });
      onDone();
    } catch {
      showToast({ type: 'error', message: 'Error de conexión. Intenta de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 text-white rounded-t-2xl"
          style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)' }}
        >
          <div className="flex items-center gap-3">
            <CalendarClock className="w-6 h-6 text-white/90" />
            <div>
              <h3 className="text-base font-bold">Cita creada</h3>
              <p className="text-xs text-white/80">
                {ctx.planName} — sesión 1 de {ctx.sessionsCount} agendada
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-700">
            Este plan incluye <strong>{ctx.sessionsCount} sesiones en total.</strong> ¿Qué hacemos
            con las{' '}
            <strong>
              {deferredCount} {deferredCount === 1 ? 'sesión restante' : 'sesiones restantes'}
            </strong>
            ?
          </p>

          <div className="space-y-2">
            <button
              onClick={handleDeferLater}
              disabled={submitting}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-teal-400 bg-teal-50 text-teal-800 text-sm font-semibold hover:bg-teal-100 transition-colors disabled:opacity-50 text-left"
            >
              <CalendarClock className="w-5 h-5 shrink-0 text-teal-600" />
              <div>
                <p className="font-bold text-teal-800">Agendar después</p>
                <p className="text-xs font-normal text-teal-600 mt-0.5">
                  Se crean {deferredCount}{' '}
                  {deferredCount === 1 ? 'consulta pendiente' : 'consultas pendientes'} en
                  &quot;Consultas por agendar&quot;
                </p>
              </div>
            </button>

            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 text-left"
            >
              <X className="w-5 h-5 shrink-0 text-slate-400" />
              <div>
                <p className="font-bold">Ignorar por ahora</p>
                <p className="text-xs font-normal text-slate-500 mt-0.5">
                  Podrás crearlas manualmente más adelante
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public types (unchanged API)
// ---------------------------------------------------------------------------

export type AppointmentOrigin =
  | 'dashboard_btn'
  | 'agenda_slot'
  | 'agenda_btn'
  | 'patient_sheet'
  | 'admin_panel';

export type AppointmentContext = {
  patientId?: string;
  doctorId?: string;
  slotStart?: string;
  packageId?: string;
  origin: AppointmentOrigin;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after the user dismisses the in-modal success step (Cerrar or Ir a consulta). */
  onSuccess?: (result: AppointmentSuccessResult) => void;
  initialContext: AppointmentContext;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewAppointmentFlow({ open, onClose, onSuccess, initialContext }: Props) {
  const router = useRouter();
  const flow = useAppointmentFlow(open, onClose, onSuccess, initialContext);

  if (!open) return null;

  // Success step: shown after a single-session appointment is created.
  // Deferred-sessions prompt takes priority (for multi-session plans).
  if (flow.successResult && !flow.deferredContext) {
    const result = flow.successResult;
    const patientName = flow.selectedPatient?.full_name ?? '';
    const scheduledAt = flow.scheduledAt ?? '';

    function handleGoToConsultation() {
      flow.clearSuccessResult();
      onClose();
      onSuccess?.(result);
      if (result.consultationId) {
        router.push(`/doctor/consultations?open=${result.consultationId}`);
      }
    }

    function handleClose() {
      flow.clearSuccessResult();
      onClose();
      onSuccess?.(result);
    }

    return (
      <SuccessStep
        result={result}
        patientName={patientName}
        scheduledAt={scheduledAt}
        onGoToConsultation={handleGoToConsultation}
        onClose={handleClose}
      />
    );
  }

  // Deferred-sessions prompt: shown when a multi-session plan appointment was
  // just created. It sits on top of the (now closed) wizard.
  if (flow.deferredContext) {
    return (
      <DeferredSessionsModal
        ctx={flow.deferredContext}
        onClose={() => {
          flow.clearDeferredContext();
          onClose();
        }}
        onDone={() => {
          flow.clearDeferredContext();
          onClose();
        }}
      />
    );
  }

  const fmtDateTime = (iso: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-VE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Caracas',
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-50 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between text-white"
          style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)' }}
        >
          <div className="flex items-center gap-3">
            <DeltaMark size={28} primary="white" />
            <div>
              <h2 className="text-lg font-bold">Nueva consulta</h2>
              <p className="text-xs text-white/80">Completa los pasos para agendar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 hover:bg-white/15 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global error banner */}
        {flow.globalError && (
          <div className="mx-5 mt-4 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {flow.globalError}
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* ── PASO 1: Paciente ──────────────────────────────────────── */}
          <AccordionSection
            step={1}
            currentStep={flow.currentStep}
            title="Paciente"
            icon={User}
            completed={flow.step1Done}
            summary={flow.selectedPatient?.full_name}
            onOpen={() => flow.setCurrentStep(1)}
          >
            <StepPatient
              patientQuery={flow.patientQuery}
              setPatientQuery={flow.setPatientQuery}
              patientResults={flow.patientResults}
              searchingPatients={flow.searchingPatients}
              showInlineCreator={flow.showInlineCreator}
              setShowInlineCreator={flow.setShowInlineCreator}
              newPatient={flow.newPatient}
              setNewPatient={flow.setNewPatient}
              creatingPatient={flow.creatingPatient}
              createPatientInline={flow.createPatientInline}
              selectPatient={flow.selectPatient}
            />
          </AccordionSection>

          {/* ── PASO 2: Consultorio ──────────────────────────────────── */}
          <AccordionSection
            step={2}
            currentStep={flow.currentStep}
            title="Consultorio y modalidad"
            icon={MapPin}
            completed={flow.step2Done}
            summary={
              flow.selectedOffice
                ? `${flow.selectedOffice.name} · ${flow.mode === 'online' ? 'Online' : 'Presencial'}`
                : flow.step2Done
                  ? `Sin consultorio específico · ${flow.mode === 'online' ? 'Online' : 'Presencial'}`
                  : undefined
            }
            onOpen={() => flow.step1Done && flow.setCurrentStep(2)}
          >
            <StepOffice
              offices={flow.offices}
              loadingOffices={flow.loadingOffices}
              selectedOffice={flow.selectedOffice}
              setSelectedOffice={flow.setSelectedOffice}
              mode={flow.mode}
              setMode={flow.setMode}
              confirmOfficeStep={flow.confirmOfficeStep}
            />
          </AccordionSection>

          {/* ── PASO 3: Tipo de consulta ─────────────────────────────── */}
          <AccordionSection
            step={3}
            currentStep={flow.currentStep}
            title="Tipo de consulta"
            icon={Pill}
            completed={flow.step3Done}
            summary={
              flow.usePackage
                ? 'Cubierto por paquete'
                : flow.selectedPlan
                  ? `${flow.selectedPlan.name} — $${flow.selectedPlan.price_usd}`
                  : undefined
            }
            onOpen={() => flow.step2Done && flow.setCurrentStep(3)}
          >
            <StepServiceType
              filteredPlans={flow.filteredPlans}
              loadingPlans={flow.loadingPlans}
              selectedPlan={flow.selectedPlan}
              setSelectedPlan={flow.setSelectedPlan}
              packages={flow.packages}
              usePackage={flow.usePackage}
              setUsePackage={flow.setUsePackage}
              selectedOffice={flow.selectedOffice}
              chiefComplaint={flow.chiefComplaint}
              setChiefComplaint={flow.setChiefComplaint}
              confirmServiceTypeStep={flow.confirmServiceTypeStep}
            />
          </AccordionSection>

          {/* ── PASO 4: Horario ──────────────────────────────────────── */}
          <AccordionSection
            step={4}
            currentStep={flow.currentStep}
            title="Fecha y hora"
            icon={Calendar}
            completed={flow.step4Done}
            summary={flow.scheduledAt ? fmtDateTime(flow.scheduledAt) : undefined}
            onOpen={() => flow.step3Done && flow.setCurrentStep(4)}
          >
            <StepSchedule
              selectedOffice={flow.selectedOffice}
              selectedDate={flow.selectedDate}
              setSelectedDate={flow.setSelectedDate}
              selectedTime={flow.selectedTime}
              selectTime={flow.selectTime}
              weekOffset={flow.weekOffset}
              setWeekOffset={flow.setWeekOffset}
              unavailableTimes={flow.unavailableTimes}
              loadingSlots={flow.loadingSlots}
              scheduledAt={flow.scheduledAt}
              customDuration={flow.customDuration}
              selectCustomSlot={flow.selectCustomSlot}
            />
          </AccordionSection>

          {/* ── PASO 5: Método de pago ───────────────────────────────── */}
          <AccordionSection
            step={5}
            currentStep={flow.currentStep}
            title="Método de pago"
            icon={CreditCard}
            completed={flow.step5Done}
            summary={
              flow.usePackage
                ? 'Cubierto por paquete'
                : flow.paymentMethod === null
                  ? 'Pagar después'
                  : flow.paymentMethod
                    ? flow.paymentMethod
                    : undefined
            }
            onOpen={() => flow.step4Done && flow.setCurrentStep(5)}
          >
            <StepPayment
              profilePaymentMethods={flow.profilePaymentMethods}
              profilePaymentDetails={flow.profilePaymentDetails}
              paymentMethod={flow.paymentMethod}
              setPaymentMethod={flow.setPaymentMethod}
              paymentReference={flow.paymentReference}
              setPaymentReference={flow.setPaymentReference}
              receiptFile={flow.receiptFile}
              setReceiptFile={flow.setReceiptFile}
              uploadingReceipt={flow.uploadingReceipt}
              usePackage={flow.usePackage}
              submitting={flow.submitting}
              canSubmit={flow.canSubmit}
              submit={flow.submit}
            />
          </AccordionSection>
        </div>
      </div>
    </div>
  );
}
