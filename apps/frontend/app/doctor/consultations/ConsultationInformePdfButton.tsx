'use client';

/**
 * app/doctor/consultations/ConsultationInformePdfButton.tsx
 *
 * Wrapper client-only que compone PdfDownloadButton + MedicalDocumentPdf para el
 * informe de una consulta individual (/doctor/consultations/[id]).
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

interface ConsultationInformePdfButtonProps {
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

export function ConsultationInformePdfButton({
  fileName,
  templateConfig,
  doctor,
  patient,
  docDate,
  consultationCode,
  content,
  className,
  children,
}: ConsultationInformePdfButtonProps) {
  return (
    <PdfDownloadButton
      fileName={fileName}
      document={
        <MedicalDocumentPdf
          docType="informe"
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
