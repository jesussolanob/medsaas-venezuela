'use client';

/**
 * app/admin/doctors/SpecialistsPdfButton.tsx
 *
 * Wrapper client-only que compone PdfDownloadButton + SpecialistsReportPdf.
 * Ambas se importan ESTÁTICAMENTE — react-pdf recibe un elemento real (no lazy/Suspense).
 *
 * Este módulo completo se carga en la página vía dynamic(..., { ssr: false }),
 * garantizando que todo el código de @react-pdf/renderer queda fuera del bundle SSR.
 */

import { FileText } from 'lucide-react';
import { PdfDownloadButton } from '@/components/pdf/PdfDownloadButton';
import { SpecialistsReportPdf } from '@/components/pdf/SpecialistsReportPdf';
import type { SpecialistRow } from '@/components/pdf/SpecialistsReportPdf';

interface SpecialistsPdfButtonProps {
  rows: SpecialistRow[];
  fileName: string;
}

export function SpecialistsPdfButton({ rows, fileName }: SpecialistsPdfButtonProps) {
  return (
    <PdfDownloadButton
      fileName={fileName}
      document={<SpecialistsReportPdf rows={rows} generatedAt={new Date().toISOString()} />}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-700"
    >
      <FileText className="w-4 h-4" />
      PDF
    </PdfDownloadButton>
  );
}
