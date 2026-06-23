'use client';

/**
 * components/pdf/PdfDownloadButton.tsx
 *
 * Botón de descarga PDF client-side.
 * Importa @react-pdf/renderer solo en el cliente (dynamic ssr:false) para evitar
 * el crash de SSR (react-pdf usa APIs del DOM que no existen en Node).
 *
 * Uso:
 *   <PdfDownloadButton
 *     fileName="recipe-juan-perez.pdf"
 *     docProps={...MedicalDocumentPdfProps}
 *   >
 *     Descargar PDF
 *   </PdfDownloadButton>
 */

import dynamic from 'next/dynamic';
import { Loader2, Download } from 'lucide-react';
import type { MedicalDocumentPdfProps } from './MedicalDocumentPdf';

// PDFDownloadLink se importa con ssr:false para evitar el crash de Node.js.
// React-pdf usa canvas/font APIs que solo existen en el browser.
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => null },
);

// El Document component también necesita importarse dinámicamente.
const MedicalDocumentPdfDynamic = dynamic(
  () => import('./MedicalDocumentPdf').then((mod) => ({ default: mod.MedicalDocumentPdf })),
  { ssr: false, loading: () => null },
);

interface PdfDownloadButtonProps {
  fileName: string;
  docProps: MedicalDocumentPdfProps;
  className?: string;
  children?: React.ReactNode;
}

export function PdfDownloadButton({
  fileName,
  docProps,
  className,
  children,
}: PdfDownloadButtonProps) {
  const defaultClass =
    'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-teal-500 text-white hover:bg-teal-600 transition-colors disabled:opacity-60';

  return (
    <PDFDownloadLink
      document={<MedicalDocumentPdfDynamic {...docProps} />}
      fileName={fileName}
      className={className ?? defaultClass}
    >
      {({ loading }) =>
        loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generando PDF...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            {children ?? 'Descargar PDF'}
          </>
        )
      }
    </PDFDownloadLink>
  );
}
