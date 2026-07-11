import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { DocumentSections } from '../../domain/entities/shared-document-link.entity';
import type { Consultation } from '../../../consultations/domain/entities/consultation.entity';
import type { Prescription } from '../../../prescriptions/domain/entities/prescription.entity';
import type { EhrRecord } from '../../../ehr/domain/entities/ehr-record.entity';

/**
 * Aggregated data required to generate a shared document PDF.
 * All fields are already decrypted plaintext — decryption happens in
 * the repository layer before data reaches this service.
 */
export interface PdfDocumentData {
  doctorName: string;
  patientName: string;
  /** Cédula del paciente (identificación) — se muestra en el encabezado del informe. */
  patientCedula: string | null;
  consultationDate: Date;
  sections: DocumentSections;
  consultation: Consultation;
  prescriptions: Prescription[];
  ehrRecord: EhrRecord | null;
}

/**
 * PdfGeneratorService — infrastructure-layer service for PDF assembly.
 *
 * Uses pdf-lib (pure JS, no native binaries) which is Cloud Run friendly.
 *
 * SECURITY:
 *   - Never log PHI fields (patient name, diagnosis, medication, etc.)
 *   - Returns raw bytes; the caller (controller) sets Content-Disposition.
 *   - Builds a minimal text-only PDF to keep output size small.
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);

  /**
   * Generates a PDF consolidating the requested sections from a consultation.
   *
   * @param data All decrypted data needed for the document.
   * @returns PDF bytes ready to be streamed to the client.
   */
  async generate(data: PdfDocumentData): Promise<Uint8Array> {
    this.logger.debug('[pdf] generating shared document');

    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 50;

    const colorDark = rgb(0.08, 0.09, 0.11);
    const colorMuted = rgb(0.36, 0.4, 0.44);
    const colorAccent = rgb(0.05, 0.58, 0.53); // teal

    // ---------------------------------------------------------------------------
    // Mutable state: current page and y position.
    // IMPORTANT: every draw call must use `currentPage`, not the initial `page`
    // capture, so that content added after a page break goes to the new page.
    // ---------------------------------------------------------------------------
    let currentPage: PDFPage = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = currentPage.getSize();
    let yPos = height - margin;

    // Helper: ensure there is enough vertical space; add a new page if not.
    const ensureSpace = (neededPts: number): void => {
      if (yPos < margin + neededPts) {
        currentPage = pdfDoc.addPage([595.28, 841.89]);
        yPos = currentPage.getSize().height - margin;
      }
    };

    // ---------------------------------------------------------------------------
    // Header
    // ---------------------------------------------------------------------------
    currentPage.drawText('Delta Salud', {
      x: margin,
      y: yPos,
      size: 18,
      font: helveticaBold,
      color: colorAccent,
    });
    yPos -= 22;

    currentPage.drawText('Documentos Compartidos', {
      x: margin,
      y: yPos,
      size: 11,
      font: helvetica,
      color: colorMuted,
    });
    yPos -= 30;

    // Separator line
    currentPage.drawLine({
      start: { x: margin, y: yPos },
      end: { x: width - margin, y: yPos },
      thickness: 1,
      color: colorAccent,
    });
    yPos -= 20;

    // ---------------------------------------------------------------------------
    // Document info block
    // ---------------------------------------------------------------------------
    const consultationDateStr = data.consultationDate.toLocaleDateString('es-VE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const infoLines = [
      `Médico: ${data.doctorName}`,
      `Paciente: ${data.patientName}`,
      ...(data.patientCedula ? [`Cédula: ${data.patientCedula}`] : []),
      `Fecha de consulta: ${consultationDateStr}`,
      `Generado el: ${new Date().toLocaleDateString('es-VE')}`,
    ];

    for (const line of infoLines) {
      ensureSpace(20);
      currentPage.drawText(line, {
        x: margin,
        y: yPos,
        size: 10,
        font: helvetica,
        color: colorDark,
      });
      yPos -= 16;
    }

    yPos -= 12;

    // ---------------------------------------------------------------------------
    // Helper: draw a section heading
    // ---------------------------------------------------------------------------
    const drawSectionHeading = (title: string): void => {
      ensureSpace(60);

      currentPage.drawLine({
        start: { x: margin, y: yPos },
        end: { x: width - margin, y: yPos },
        thickness: 0.5,
        color: colorMuted,
      });
      yPos -= 14;

      currentPage.drawText(title, {
        x: margin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: colorAccent,
      });
      yPos -= 18;
    };

    // ---------------------------------------------------------------------------
    // Helper: draw wrapped text
    // ---------------------------------------------------------------------------
    const contentWidth = width - margin * 2;
    const drawText = (text: string, fontSize = 10): void => {
      const maxCharsPerLine = Math.floor(contentWidth / (fontSize * 0.55));
      const words = text.split(' ');
      let currentLine = '';

      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          ensureSpace(fontSize + 4);
          currentPage.drawText(currentLine, {
            x: margin + 8,
            y: yPos,
            size: fontSize,
            font: helvetica,
            color: colorDark,
          });
          yPos -= fontSize + 4;
          currentLine = word;
        }
      }

      if (currentLine) {
        ensureSpace(fontSize + 4);
        currentPage.drawText(currentLine, {
          x: margin + 8,
          y: yPos,
          size: fontSize,
          font: helvetica,
          color: colorDark,
        });
        yPos -= fontSize + 4;
      }

      yPos -= 8;
    };

    // ---------------------------------------------------------------------------
    // Helper: draw a labeled field
    // ---------------------------------------------------------------------------
    const drawField = (label: string, value: string | null | undefined): void => {
      if (!value) return;
      ensureSpace(26);
      currentPage.drawText(`${label}:`, {
        x: margin + 8,
        y: yPos,
        size: 10,
        font: helveticaBold,
        color: colorDark,
      });
      yPos -= 13;
      drawText(value);
    };

    // ---------------------------------------------------------------------------
    // Section: Informe (consultation blocks/report)
    // ---------------------------------------------------------------------------
    if (data.sections.report) {
      drawSectionHeading('Informe de Consulta');

      if (data.consultation.chiefComplaint) {
        drawField('Motivo de consulta', data.consultation.chiefComplaint);
      }
      if (data.consultation.diagnosis) {
        drawField('Diagnóstico', data.consultation.diagnosis);
      }
      if (data.consultation.treatment) {
        drawField('Plan de tratamiento', data.consultation.treatment);
      }
      if (data.consultation.notes) {
        drawField('Observaciones', data.consultation.notes);
      }

      // Render blocks_snapshot entries if present
      if (data.consultation.blocksSnapshot) {
        const snapshot = data.consultation.blocksSnapshot;
        const blocks = Array.isArray(snapshot)
          ? (snapshot as Array<Record<string, unknown>>)
          : Object.values(snapshot);

        for (const block of blocks) {
          const blockRecord = block as Record<string, unknown>;
          if (blockRecord['title']) {
            ensureSpace(20);
            currentPage.drawText(String(blockRecord['title']), {
              x: margin + 8,
              y: yPos,
              size: 10,
              font: helveticaBold,
              color: colorDark,
            });
            yPos -= 13;
          }
          if (blockRecord['content']) {
            drawText(String(blockRecord['content']));
          }
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Section: Recetas
    // ---------------------------------------------------------------------------
    if (data.sections.prescriptions && data.prescriptions.length > 0) {
      drawSectionHeading('Recetas Médicas');

      for (let i = 0; i < data.prescriptions.length; i++) {
        const rx = data.prescriptions[i]!;
        ensureSpace(20);
        currentPage.drawText(`Receta ${i + 1}`, {
          x: margin + 8,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: colorDark,
        });
        yPos -= 13;

        drawField('Medicamento', rx.medication);
        if (rx.dosage) drawField('Dosis', rx.dosage);
        if (rx.frequency) drawField('Frecuencia', rx.frequency);
        if (rx.duration) drawField('Duración', rx.duration);
        if (rx.notes) drawField('Indicaciones', rx.notes);
        yPos -= 4;
      }
    } else if (data.sections.prescriptions) {
      drawSectionHeading('Recetas Médicas');
      drawText('No hay recetas registradas para esta consulta.');
    }

    // ---------------------------------------------------------------------------
    // Section: EHR
    // ---------------------------------------------------------------------------
    if (data.sections.ehr) {
      drawSectionHeading('Historia Clínica');

      if (data.ehrRecord) {
        if (data.ehrRecord.diagnosis) {
          drawField('Diagnóstico', data.ehrRecord.diagnosis);
        }
        if (data.ehrRecord.treatmentPlan) {
          drawField('Plan terapéutico', data.ehrRecord.treatmentPlan);
        }
      } else {
        drawText('No hay registro de historia clínica para esta consulta.');
      }
    }

    // ---------------------------------------------------------------------------
    // Footer (first page only — kept simple)
    // ---------------------------------------------------------------------------
    const firstPage = pdfDoc.getPage(0);
    firstPage.drawText('Este documento es confidencial y de uso médico exclusivo.', {
      x: margin,
      y: margin,
      size: 8,
      font: helvetica,
      color: colorMuted,
    });

    this.logger.debug('[pdf] document generated successfully');
    return pdfDoc.save();
  }
}
