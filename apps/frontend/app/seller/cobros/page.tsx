'use client';

/**
 * /seller/cobros — Datos de cobro del vendedor.
 *
 * Aquí el vendedor configura cómo Delta le paga sus comisiones: pago móvil,
 * transferencia bancaria, Zelle, etc.
 *
 * Reutiliza el componente PaymentDetailsEditor que también usa el especialista
 * en /doctor/settings para sus métodos de pago. La lógica de formulario,
 * validación y guardado es idéntica — solo cambia el endpoint destino.
 *
 * Datos bancarios: NUNCA se loguean.
 */

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import PaymentDetailsEditor from '@/components/shared/PaymentDetailsEditor';
import { showToast } from '@/components/ui/Toaster';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentDetailsResponse {
  paymentDetails: Record<string, unknown> | null;
}

type LoadState = 'loading' | 'ready' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SellerCobrosPage() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [initialMethods, setInitialMethods] = useState<string[]>([]);
  const [initialDetails, setInitialDetails] = useState<Record<string, unknown>>({});
  // Incrementar este key reinicializa el editor cuando se recargan datos.
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadPaymentDetails() {
      try {
        const res = await fetch('/api/seller/payment-details');
        if (!res.ok) {
          if (mounted) setLoadState('error');
          return;
        }
        const json = (await res.json()) as { success: boolean; data: PaymentDetailsResponse };
        if (!json.success || !mounted) return;

        const details = json.data.paymentDetails ?? {};
        // Los métodos activos se derivan de las claves presentes en el JSONB.
        // El vendedor no tiene una columna payment_methods separada como el especialista.
        const methods = Object.keys(details);

        setInitialDetails(details);
        setInitialMethods(methods);
        setEditorKey((k) => k + 1);
        setLoadState('ready');
      } catch {
        if (mounted) setLoadState('error');
      }
    }

    void loadPaymentDetails();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave(
    methods: string[],
    details: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    // Filtra el JSONB: solo conserva las claves cuyo método está activo.
    const filtered: Record<string, unknown> = {};
    for (const method of methods) {
      if (details[method] !== undefined) {
        filtered[method] = details[method];
      }
    }

    const res = await fetch('/api/seller/payment-details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentDetails: filtered }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? 'Error desconocido' };
    }

    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loadState === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-7 h-7 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-slate-500 text-sm">No se pudo cargar la información de cobro.</p>
        <button
          onClick={() => {
            setLoadState('loading');
            setEditorKey((k) => k + 1);
          }}
          className="mt-4 text-sm font-semibold text-teal-600 hover:text-teal-700"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Datos de cobro</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Aquí configuras cómo Delta te paga tus comisiones. Agrega los métodos disponibles y
            completa los datos de cada uno.
          </p>
        </div>
      </div>

      {/* Editor reutilizable */}
      <PaymentDetailsEditor
        key={editorKey}
        initialMethods={initialMethods}
        initialDetails={initialDetails}
        title="Métodos para recibir comisiones"
        description="Activa los métodos que manejas y expande cada uno para ingresar los datos. Delta usará esta información para transferirte tus comisiones."
        saveLabel="Guardar datos de cobro"
        onSave={async (methods, details) => {
          const result = await handleSave(methods, details);
          if (result.ok) {
            showToast({ type: 'success', message: 'Datos de cobro guardados' });
          } else {
            showToast({
              type: 'error',
              message: 'No se pudo guardar. ' + (result.error ?? ''),
            });
          }
          return result;
        }}
      />
    </div>
  );
}
