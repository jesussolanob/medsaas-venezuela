import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { AI_TEXT_GENERATOR_PORT, type IAiTextGenerator } from '../ports/ai-text-generator.port';
import {
  AI_REQUEST_LOG_REPOSITORY,
  type IAiRequestLogRepository,
} from '../../domain/repositories/ai-request-log.repository';
import {
  PLAN_FEATURES_REPOSITORY,
  type IPlanFeaturesRepository,
} from '../../../doctor-settings/domain/repositories/plan-features.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import {
  PLAN_CONFIG_REPOSITORY,
  type IPlanConfigRepository,
} from '../../../doctor-settings/domain/repositories/plan-config.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../consultations/domain/repositories/consultation.repository';

import { AiRequestLog } from '../../domain/entities/ai-request-log.entity';
import { AiFeatureDeniedError } from '../../domain/errors/ai-feature-denied.error';
import { PatientNotFoundForAiError } from '../../domain/errors/patient-not-found-for-ai.error';

import type {
  AiTextInputDto,
  AiTextOutputDto,
  ImproveBlockInput,
  SummarizeReportInput,
} from '../dtos/ai-text.dto';

// ---------------------------------------------------------------------------
// Feature key constants
// ---------------------------------------------------------------------------

const FEATURE_AI_ASSISTANT = 'ai_assistant';
const FEATURE_AI_REPORTS = 'ai_reports';
const DOCTOR_ROLE = 'doctor';

// ---------------------------------------------------------------------------
// History query constants
// ---------------------------------------------------------------------------

/** Max number of consultations to include in patient_history prompt. */
const MAX_HISTORY_CONSULTATIONS = 20;

/**
 * AiTextUseCase
 *
 * Handles three AI text actions: improve_block, summarize_report, patient_history.
 *
 * Plan gating (FAIL-CLOSED):
 *   - improve_block / patient_history → requires `ai_assistant` feature.
 *   - summarize_report → requires `ai_reports` feature.
 *   - super_admin bypasses the gate.
 *
 * PHI rules:
 *   - NEVER log clinical content (prompts, responses, diagnosis, treatment, notes).
 *   - Audit log stores only metadata: doctorId, action, status.
 *   - patientId from `patient_history` is NOT logged (anti-IDOR metadata leak).
 */
@Injectable()
export class AiTextUseCase {
  private readonly logger = new Logger(AiTextUseCase.name);

  constructor(
    @Inject(AI_TEXT_GENERATOR_PORT)
    private readonly textGenerator: IAiTextGenerator,
    @Inject(AI_REQUEST_LOG_REPOSITORY)
    private readonly logRepo: IAiRequestLogRepository,
    @Inject(PLAN_FEATURES_REPOSITORY)
    private readonly featuresRepo: IPlanFeaturesRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(PLAN_CONFIG_REPOSITORY)
    private readonly planConfigRepo: IPlanConfigRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
  ) {}

  async execute(input: AiTextInputDto): Promise<AiTextOutputDto> {
    const { action } = input.actionInput;

    // 1. Plan gate — fail-closed; super_admin bypasses.
    if (!input.isSuperAdmin) {
      const requiredFeature =
        action === 'summarize_report' ? FEATURE_AI_REPORTS : FEATURE_AI_ASSISTANT;
      await this.assertPlanFeature(input.doctorId, requiredFeature);
    }

    // 2. Build prompt based on action.
    let prompt: string;
    if (input.actionInput.action === 'improve_block') {
      prompt = buildBlockPrompt(
        input.actionInput.block_key,
        input.actionInput.block_label,
        input.actionInput.content,
      );
    } else if (input.actionInput.action === 'summarize_report') {
      prompt = await this.buildSummarizeReportPrompt(input.actionInput);
    } else {
      // patient_history
      prompt = await this.buildPatientHistoryPrompt(input.actionInput.patientId, input.doctorId);
    }

    // 3. Call AI generator and write audit log.
    let status = 'success';

    try {
      const result = await this.textGenerator.generate(prompt);
      await this.writeAuditLog(input.doctorId, action, status);
      return { result };
    } catch (err) {
      status = 'error';
      await this.writeAuditLog(input.doctorId, action, status);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Plan gate
  // ---------------------------------------------------------------------------

  /**
   * Asserts that the doctor's effective plan includes the required feature.
   * FAIL-CLOSED: any exception during plan resolution → 403.
   */
  private async assertPlanFeature(doctorId: string, featureKey: string): Promise<void> {
    try {
      const effectivePlan = await this.resolveEffectivePlan(doctorId);
      const features = await this.featuresRepo.findByPlan(effectivePlan);
      const feature = features.find((f) => f.featureKey === featureKey);

      if (!feature || !feature.enabled) {
        throw new AiFeatureDeniedError('plan_not_included');
      }
    } catch (err) {
      if (err instanceof AiFeatureDeniedError) {
        throw err;
      }
      this.logger.warn(
        `[AiTextUseCase][assertPlanFeature] plan check failed for doctor ${doctorId}`,
      );
      throw new AiFeatureDeniedError('plan_check_failed');
    }
  }

  /**
   * Resolves the effective plan key for the doctor, applying lazy-downgrade logic.
   * Mirrors the logic in TranscribeAudioUseCase.
   */
  private async resolveEffectivePlan(doctorId: string): Promise<string> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) {
      throw new AiFeatureDeniedError('plan_check_failed');
    }

    const storedPlan = profile.plan ?? 'delta_free';

    const planConfig = await this.planConfigRepo.findByKey(storedPlan);
    if (planConfig?.isPermanent) {
      return storedPlan;
    }

    const validStatuses = new Set(['active', 'trial', 'trialing']);
    if (profile.subscriptionStatus && validStatuses.has(profile.subscriptionStatus)) {
      return storedPlan;
    }

    const roleKey = planConfig?.roleKey ?? DOCTOR_ROLE;
    const permanentPlan = await this.planConfigRepo.findPermanentPlanForRole(roleKey);
    return permanentPlan?.planKey ?? 'delta_free';
  }

  // ---------------------------------------------------------------------------
  // Prompt builders
  // ---------------------------------------------------------------------------

  private async buildSummarizeReportPrompt(input: SummarizeReportInput): Promise<string> {
    const lines: string[] = [];

    // Legacy fields
    const { legacy } = input;
    if (legacy.chief_complaint?.trim()) {
      lines.push(`Motivo: ${legacy.chief_complaint.trim()}`);
    }
    if (legacy.notes?.trim()) {
      lines.push(`Notas: ${legacy.notes.trim()}`);
    }
    if (legacy.diagnosis?.trim()) {
      lines.push(`Diagnóstico: ${legacy.diagnosis.trim()}`);
    }
    if (legacy.treatment?.trim()) {
      lines.push(`Tratamiento: ${legacy.treatment.trim()}`);
    }

    // Dynamic blocks — only include blocks with content
    for (const meta of input.blocks_meta) {
      const rawValue = input.blocks_data[meta.key];
      if (rawValue === undefined || rawValue === null || rawValue === '') continue;

      let valueStr: string;
      if (Array.isArray(rawValue)) {
        valueStr = rawValue.map((v) => String(v)).join('\n');
      } else if (typeof rawValue === 'string') {
        valueStr = rawValue;
      } else {
        valueStr = JSON.stringify(rawValue);
      }

      const cleaned = stripHtml(valueStr).trim();
      if (!cleaned) continue;

      lines.push(`${meta.label}: ${cleaned}`);
    }

    const reportText = lines.join('\n');

    return `Eres un asistente médico. Resume el siguiente informe médico en un párrafo claro y conciso para que el paciente pueda entenderlo fácilmente. Usa lenguaje sencillo, evita jerga médica cuando sea posible, y mantén los datos importantes. Responde en español.\n\nInforme:\n${reportText}`;
  }

  private async buildPatientHistoryPrompt(patientId: string, doctorId: string): Promise<string> {
    // Anti-IDOR: scope patient lookup to the authenticated doctor.
    const patient = await this.patientRepo.findById(patientId, doctorId);
    if (!patient) {
      throw new PatientNotFoundForAiError();
    }

    // Fetch consultations scoped to (patientId, doctorId) — already decrypted by repo.
    const consultationResult = await this.consultationRepo.findByPatient(
      patientId,
      doctorId,
      1,
      MAX_HISTORY_CONSULTATIONS,
    );

    const consultations = consultationResult.items;

    // Non-sensitive patient context (no cedula, no phone, no email — PHI).
    const patientInfoParts: string[] = [];
    patientInfoParts.push(`Nombre: ${patient.fullName}`);
    if (patient.age !== null) patientInfoParts.push(`Edad: ${patient.age} años`);
    if (patient.sex) patientInfoParts.push(`Sexo: ${patient.sex}`);
    if (patient.bloodType) patientInfoParts.push(`Tipo de sangre: ${patient.bloodType}`);
    if (patient.allergies?.trim()) patientInfoParts.push(`Alergias: ${patient.allergies}`);
    if (patient.chronicConditions?.trim()) {
      patientInfoParts.push(`Condiciones crónicas: ${patient.chronicConditions}`);
    }
    const patientInfo = `Paciente:\n${patientInfoParts.join('\n')}`;

    // Build history text from consultations.
    const historyParts: string[] = [];
    for (const c of consultations) {
      const parts: string[] = [`Fecha: ${c.consultationDate.toISOString().split('T')[0]}`];
      if (c.chiefComplaint?.trim()) parts.push(`Motivo: ${c.chiefComplaint.trim()}`);
      if (c.diagnosis?.trim()) parts.push(`Diagnóstico: ${c.diagnosis.trim()}`);
      if (c.treatment?.trim()) parts.push(`Tratamiento: ${c.treatment.trim()}`);
      if (c.notes?.trim()) parts.push(`Notas: ${c.notes.trim()}`);
      historyParts.push(parts.join(' | '));
    }
    const historyText = historyParts.join('\n');

    const n = consultations.length;

    return `Eres un asistente médico. Analiza el historial de consultas de este paciente y genera un resumen ejecutivo útil para el médico. Incluye: patrones relevantes, evolución del paciente, diagnósticos recurrentes, y cualquier dato que el médico debe tener presente para la consulta actual. Sé conciso y práctico. Responde en español.\n\n${patientInfo}\n\nHistorial de consultas (${n} consultas):\n${historyText}`;
  }

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  /** Writes an audit log entry. Non-blocking — errors are swallowed. */
  private async writeAuditLog(doctorId: string, action: string, status: string): Promise<void> {
    try {
      const log = AiRequestLog.create({
        id: randomUUID(),
        doctorId,
        feature: `text_${action}`,
        status,
        audioBytes: 0,
        model: 'gemini-text',
      });
      await this.logRepo.save(log);
    } catch {
      // Audit failures must never break the main flow.
      this.logger.warn('[AiTextUseCase][writeAuditLog] failed to persist audit log');
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt helpers (module-level, pure functions — no side effects)
// ---------------------------------------------------------------------------

/**
 * Strips HTML tags from a string.
 * Simple tag stripping — not a security sanitizer (input already comes from
 * doctor-controlled data, not untrusted user input).
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .trim();
}

/**
 * Builds the improve_block prompt.
 * Exported for testing.
 */
export function buildBlockPrompt(blockKey: string, blockLabel: string, content: string): string {
  const instruction = getBlockInstruction(blockKey, blockLabel);
  const cleanContent = stripHtml(content);

  return `Eres un asistente de redacción médica profesional. ${instruction} Mantén toda la información clínica intacta — NO inventes datos que no estén en el texto original. Responde en español (Venezuela) y devuelve SOLO el texto mejorado, sin explicaciones, encabezados, ni comillas.\n\nTexto original (${blockLabel}):\n${cleanContent}`;
}

function getBlockInstruction(blockKey: string, blockLabel: string): string {
  switch (blockKey) {
    case 'chief_complaint':
      return 'Reescribe el motivo de consulta de forma clara, concisa y en lenguaje médico apropiado. Estructura los síntomas con su tiempo de evolución, intensidad y factores asociados cuando estén presentes.';
    case 'history':
      return 'Mejora la redacción de los antecedentes del paciente. Organízalos en categorías (personales, familiares, quirúrgicos, alérgicos, hábitos) cuando aplique, y usa terminología médica estandarizada.';
    case 'physical_exam':
      return 'Mejora la redacción del examen físico. Estructura los hallazgos por sistemas (general, cardiopulmonar, abdominal, neurológico, etc.) y usa terminología semiológica precisa.';
    case 'diagnosis':
      return 'Mejora la redacción del diagnóstico clínico. Sé preciso, usa terminología CIE-10 cuando sea posible, distingue diagnóstico principal de diagnósticos secundarios o diferenciales si los hay.';
    case 'treatment':
      return 'Mejora la redacción del plan terapéutico. Estructura el tratamiento (farmacológico, no farmacológico, medidas generales) de forma clara y organizada.';
    case 'prescription':
      return 'Mejora la redacción de la prescripción. Asegúrate que cada medicamento tenga: nombre genérico, dosis, vía, frecuencia y duración. Mantén el formato profesional de receta médica.';
    case 'rest':
      return 'Mejora la redacción del reposo indicado. Especifica tipo de reposo (absoluto/relativo/laboral), duración y motivo clínico de forma profesional.';
    case 'tasks':
      return 'Mejora la redacción de las tareas terapéuticas para el paciente. Sé claro y específico en lo que el paciente debe hacer, con instrucciones accionables y medibles.';
    case 'nutrition_plan':
      return 'Mejora la redacción del plan alimenticio. Estructura por comidas (desayuno, merienda, almuerzo, cena), enfatiza balance nutricional, porciones, alimentos recomendados y a evitar.';
    case 'exercises':
      return 'Mejora la redacción de la rutina de ejercicios. Especifica tipo de ejercicio, series, repeticiones, frecuencia semanal, progresión y precauciones cuando apliquen.';
    case 'indications':
      return 'Mejora la redacción de las indicaciones generales al paciente. Usa lenguaje claro, lista los puntos cuando sean varios y enfatiza signos de alarma si los hay.';
    case 'recommendations':
      return 'Mejora la redacción de las recomendaciones complementarias. Sé práctico, accionable y prioriza lo más importante para el paciente.';
    case 'requested_exams':
      return 'Mejora la redacción de los exámenes solicitados. Usa el nombre completo y estandarizado de cada estudio (laboratorio, imagen, especiales) y agrupa por tipo cuando aplique.';
    case 'next_followup':
      return 'Mejora la redacción de la próxima cita / control. Especifica fecha aproximada, motivo del control y qué debe traer el paciente si aplica.';
    case 'internal_notes':
      return 'Mejora la redacción de las notas internas del médico. Estas notas son privadas (no se comparten con el paciente) — sé directo, técnico y enfócate en seguimiento, pendientes y consideraciones clínicas.';
    default:
      return `Mejora la redacción de este bloque clínico (${blockLabel}). Hazlo más profesional, claro y estructurado.`;
  }
}
