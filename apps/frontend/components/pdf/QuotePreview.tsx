'use client';

/**
 * QuotePreview
 *
 * Vista previa REAL del presupuesto (módulo Presupuestos). Renderiza el mismo
 * componente react-pdf que usa la descarga real (QuotePdf), con datos de
 * ejemplo — mismo patrón que ReceiptPreview (vista propia, con branding del
 * doctor), pero sobre @react-pdf/renderer porque QuotePdf ya es un documento
 * react-pdf, no HTML como el recibo.
 */

import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, FileText } from 'lucide-react';
import QuotePdf, {
  type QuoteItemPdf,
  type QuoteTemplatePdf,
  type QuoteDoctorPdf,
} from './QuotePdf';

// PDFViewer es pesado; se difiere igual que en TemplatePdfPreview.
const PDFViewer = dynamic(() => import('@react-pdf/renderer').then((mod) => mod.PDFViewer), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-[520px] gap-3 bg-slate-50 rounded-xl border border-slate-200">
      <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      <p className="text-sm text-slate-500">Cargando vista previa del PDF...</p>
    </div>
  ),
});

const SAMPLE_ITEMS: QuoteItemPdf[] = [
  {
    kind: 'service',
    name: 'Consulta especializada',
    description: 'Evaluación inicial',
    quantity: 1,
    unit_price_usd: 50,
    amount_usd: 50,
  },
  {
    kind: 'product',
    name: 'Kit de materiales',
    description: '',
    quantity: 2,
    unit_price_usd: 15,
    amount_usd: 30,
  },
  {
    kind: 'manual',
    name: 'Servicio adicional (ejemplo)',
    description: 'Ítem cargado a mano, sin catálogo',
    quantity: 1,
    unit_price_usd: 20,
    amount_usd: 20,
  },
];

const SAMPLE_SUBTOTAL = SAMPLE_ITEMS.reduce((sum, it) => sum + it.amount_usd, 0);
const SAMPLE_DISCOUNT = 10;
const SAMPLE_TOTAL = SAMPLE_SUBTOTAL - SAMPLE_DISCOUNT;

interface QuotePreviewProps {
  templateConfig: QuoteTemplatePdf;
  doctor: QuoteDoctorPdf;
  /** Llamado cuando el PDFViewer termina de renderizar (mismo patrón que TemplatePdfPreview). */
  onReady?: () => void;
}

export function QuotePreview({ templateConfig, doctor, onReady }: QuotePreviewProps) {
  // PDFViewer no tiene callback nativo de "primera página lista"; igual que
  // TemplatePdfPreview, se avisa al padre tras un breve delay.
  useEffect(() => {
    const t = setTimeout(() => onReady?.(), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha estable: `new Date()` en cada render regeneraría el PDF en bucle.
  const docDate = useMemo(() => new Date().toISOString(), []);

  const pdfDocument = useMemo(
    () => (
      <QuotePdf
        quoteNumber="PRES-EJEMPLO"
        status="sent"
        validUntil={null}
        notes="Precio válido por 15 días. Incluye materiales (ejemplo)."
        subtotal_usd={SAMPLE_SUBTOTAL}
        discount_usd={SAMPLE_DISCOUNT}
        total_usd={SAMPLE_TOTAL}
        bcv_rate={null}
        total_bs={null}
        created_at={docDate}
        items={SAMPLE_ITEMS}
        doctor={doctor}
        recipientName="Juan Pérez (ejemplo)"
        templateConfig={templateConfig}
      />
    ),
    [templateConfig, doctor, docDate],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-teal-500" />
        <span className="text-sm font-bold text-slate-700">Vista previa real — Presupuesto</span>
      </div>
      <p className="text-[11px] text-slate-400 italic">
        La vista previa usa datos de ejemplo. Al descargar un presupuesto real desde Presupuestos,
        se incluyen los ítems, el destinatario y los montos reales.
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <PDFViewer width="100%" height={520} showToolbar={false}>
          {pdfDocument}
        </PDFViewer>
      </div>
    </div>
  );
}
