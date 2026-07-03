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

import { AlertCircle, Calendar, CreditCard, MapPin, Pill, User, X } from 'lucide-react';
import AccordionSection from './AccordionSection';
import { useAppointmentFlow } from './useAppointmentFlow';
import StepPatient from './steps/StepPatient';
import StepOffice from './steps/StepOffice';
import StepServiceType from './steps/StepServiceType';
import StepSchedule from './steps/StepSchedule';
import StepPayment from './steps/StepPayment';

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
  onSuccess?: (appointmentId: string) => void;
  initialContext: AppointmentContext;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewAppointmentFlow({ open, onClose, onSuccess, initialContext }: Props) {
  const flow = useAppointmentFlow(open, onClose, onSuccess, initialContext);

  if (!open) return null;

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
            <svg width="28" height="28" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <path
                d="M125 40 C75 25, 25 65, 30 120 C35 165, 75 190, 120 175"
                stroke="#ffffff"
                strokeWidth="26"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M145 155 C170 120, 170 70, 140 45"
                stroke="#FF8A65"
                strokeWidth="26"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
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
