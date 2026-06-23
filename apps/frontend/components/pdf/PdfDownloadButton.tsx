'use client';

/**
 * components/pdf/PdfDownloadButton.tsx
 *
 * Botón de descarga PDF genérico client-side.
 * PDFDownloadLink se carga con dynamic ssr:false para no crashear en Node.
 *
 * PATRÓN DE USO CORRECTO:
 *   1. Creá un wrapper 'use client' que importe ESTÁTICAMENTE este botón Y el
 *      componente-documento de @react-pdf. En ese wrapper pasá el documento como
 *      elemento real: document={<MiDocumentoPdf {...props} />}
 *   2. En la PÁGINA importá ese wrapper con dynamic(..., { ssr: false }).
 *
 * NO pasés componentes next/dynamic como `document`. El reconciler de react-pdf
 * no resuelve lazy/Suspense → el PDF sale vacío en runtime.
 */

import dynamic from 'next/dynamic';
import { Loader2, Download } from 'lucide-react';
// Solo se importa el TYPE (borrado en compilación) — no rompe SSR.
import type { DocumentProps } from '@react-pdf/renderer';

// PDFDownloadLink se importa con ssr:false para evitar el crash de Node.js.
// React-pdf usa canvas/font APIs que solo existen en el browser.
const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFDownloadLink),
  { ssr: false, loading: () => null },
);

interface PdfDownloadButtonProps {
  fileName: string;
  /** El elemento <Document> de @react-pdf que PDFDownloadLink usará para renderizar.
   *  Debe construirse con un componente importado dinámicamente (ssr:false) en el caller. */
  document: React.ReactElement<DocumentProps>;
  className?: string;
  children?: React.ReactNode;
}

export function PdfDownloadButton({
  fileName,
  document,
  className,
  children,
}: PdfDownloadButtonProps) {
  const defaultClass =
    'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-teal-500 text-white hover:bg-teal-600 transition-colors disabled:opacity-60';

  return (
    <PDFDownloadLink document={document} fileName={fileName} className={className ?? defaultClass}>
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
