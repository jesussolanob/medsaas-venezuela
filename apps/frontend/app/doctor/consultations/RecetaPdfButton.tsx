'use client';

/**
 * app/doctor/consultations/RecetaPdfButton.tsx
 *
 * Wrapper client-only que compone PdfDownloadButton + MedicalDocumentPdf para la
 * receta médica en la vista de consultas (/doctor/consultations).
 *
 * Ambos se importan ESTÁTICAMENTE — react-pdf recibe un elemento real (no lazy/Suspense).
 * Este módulo completo se carga en la página vía dynamic(..., { ssr: false }).
 */

import { PdfDownloadButton } from '@/components/pdf/PdfDownloadButton';
import { MedicalDocumentPdf } from '@/components/pdf/MedicalDocumentPdf';
import type {
  TemplateConfigPdf,
  DoctorInfoPdf,
  ContentBlock,
} from '@/components/pdf/MedicalDocumentPdf';

interface RecetaPdfButtonProps {
  fileName: string;
  templateConfig: TemplateConfigPdf;
  doctor: DoctorInfoPdf;
  patient: { fullName: string; cedula: string | null };
  docDate: string;
  consultationCode: string;
  content: ContentBlock[];
  className?: string;
  children?: React.ReactNode;
}

export function RecetaPdfButton({
  fileName,
  templateConfig,
  doctor,
  patient,
  docDate,
  consultationCode,
  content,
  className,
  children,
}: RecetaPdfButtonProps) {
  return (
    <PdfDownloadButton
      fileName={fileName}
      document={
        <MedicalDocumentPdf
          docType="recipe"
          templateConfig={templateConfig}
          doctor={doctor}
          patient={patient}
          docDate={docDate}
          consultationCode={consultationCode}
          content={content}
        />
      }
      className={className}
    >
      {children}
    </PdfDownloadButton>
  );
}
