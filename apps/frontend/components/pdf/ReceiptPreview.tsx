'use client';

/**
 * ReceiptPreview
 *
 * Vista previa REAL del recibo de pago. Renderiza exactamente el mismo HTML que
 * genera Cobros al descargar un recibo (`buildReceiptHtml` de lib/receipt-pdf.ts),
 * con datos de ejemplo, dentro de un iframe.
 *
 * Antes la preview del recibo usaba `MedicalDocumentPdf` (react-pdf) con bloques
 * de muestra — un documento COMPLETAMENTE distinto al recibo real → la vista
 * previa no correspondía al archivo que se descarga. Este componente elimina esa
 * discrepancia usando el generador de verdad.
 */

import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { buildReceiptHtml, type ReceiptData } from '@/lib/receipt-pdf';

interface ReceiptPreviewProps {
  /** Config de la plantilla del doctor (encabezado, pie, color, logo/firma). */
  templateConfig: {
    header_text: string | null;
    footer_text: string | null;
    primary_color: string | null;
    logo_url: string | null;
    signature_url: string | null;
    show_logo: boolean;
    show_signature: boolean;
  };
  doctor: {
    fullName: string;
    specialty: string | null;
    licenseNumber: string | null;
  };
}

export function ReceiptPreview({ templateConfig, doctor }: ReceiptPreviewProps) {
  const html = useMemo(() => {
    const sample: ReceiptData = {
      paymentCode: 'P300-EJEMPLO',
      consultationCode: 'C200-EJEMPLO',
      patientName: 'Juan Pérez (ejemplo)',
      patientCedula: 'V-12.345.678',
      amountUsd: 30,
      amountBs: 30 * 727.45,
      bcvRate: 727.45,
      paymentMethod: 'pago_movil',
      paymentReference: '0102-0000000',
      paidAt: '2026-07-16T12:00:00.000Z',
      scheduledAt: '2026-07-16T12:00:00.000Z',
      planName: 'Consulta general',
      extraItems: [{ name: 'Examen adicional (ejemplo)', amount: 10 }],
      doctorName: doctor.fullName,
      doctorTitle: null,
      doctorSpecialty: doctor.specialty,
      doctorLicense: doctor.licenseNumber,
      logoUrl: templateConfig.logo_url,
      signatureUrl: templateConfig.signature_url,
      primaryColor: templateConfig.primary_color ?? '#0891b2',
      headerText: templateConfig.header_text,
      footerText: templateConfig.footer_text,
      showLogo: templateConfig.show_logo,
      showSignature: templateConfig.show_signature,
    };
    // buildReceiptHtml incluye `window.onload = window.print()` para la descarga
    // real; en la preview lo quitamos para que el iframe no dispare el diálogo.
    return buildReceiptHtml(sample).replace(
      /<script>[\s\S]*?window\.print\(\)[\s\S]*?<\/script>/,
      '',
    );
  }, [templateConfig, doctor]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-teal-500" />
        <span className="text-sm font-bold text-slate-700">Vista previa real — Recibo de pago</span>
      </div>
      <p className="text-[11px] text-slate-400 italic">
        Esta es la vista previa del recibo real que se descarga desde Cobros, con datos de ejemplo.
      </p>
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        <iframe
          title="Vista previa del recibo"
          srcDoc={html}
          className="w-full"
          style={{ height: 520, border: 'none' }}
        />
      </div>
    </div>
  );
}
