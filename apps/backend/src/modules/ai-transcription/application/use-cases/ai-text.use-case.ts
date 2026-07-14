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
  ImproveBlockMode,
  ParsedMedication,
  ParsePrescriptionOutputDto,
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
 * Handles four AI text actions:
 *   - improve_block      → rewrites a clinical block in formal prose.
 *   - summarize_report   → generates a patient-readable summary of a consultation report.
 *   - patient_history    → generates an executive summary of a patient's consultation history.
 *   - parse_prescription → extracts structured medications from a voice-dictated transcript.
 *
 * Plan gating (FAIL-CLOSED):
 *   - improve_block / patient_history / parse_prescription → requires `ai_assistant` feature.
 *   - summarize_report → requires `ai_reports` feature.
 *   - super_admin bypasses the gate.
 *
 * PHI rules:
 *   - NEVER log clinical content (prompts, responses, diagnosis, treatment, notes).
 *   - Audit log stores only metadata: doctorId, action, status.
 *   - patientId from `patient_history` is NOT logged (anti-IDOR metadata leak).
 *   - Transcript content from `parse_prescription` is NEVER logged.
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

  async execute(input: AiTextInputDto): Promise<AiTextOutputDto | ParsePrescriptionOutputDto> {
    const { action } = input.actionInput;

    // 1. Plan gate — fail-closed; super_admin bypasses.
    if (!input.isSuperAdmin) {
      const requiredFeature =
        action === 'summarize_report' ? FEATURE_AI_REPORTS : FEATURE_AI_ASSISTANT;
      await this.assertPlanFeature(input.doctorId, requiredFeature);
    }

    // 2. Handle parse_prescription separately — returns structured JSON, not raw text.
    if (input.actionInput.action === 'parse_prescription') {
      return this.executeParsePrescription(input.actionInput.content, input.doctorId);
    }

    // 3. Build prompt for text actions.
    let prompt: string;
    if (input.actionInput.action === 'improve_block') {
      prompt = buildBlockPrompt(
        input.actionInput.block_key,
        input.actionInput.block_label,
        input.actionInput.content,
        input.actionInput.mode,
      );
    } else if (input.actionInput.action === 'summarize_report') {
      prompt = await this.buildSummarizeReportPrompt(input.actionInput);
    } else {
      // patient_history
      prompt = await this.buildPatientHistoryPrompt(input.actionInput.patientId, input.doctorId);
    }

    // 4. Call AI generator and write audit log.
    let status = 'success';

    try {
      const raw = await this.textGenerator.generate(prompt);
      // Post-process improve_block output: strip leading parenthetical field name and
      // wrapping quotes that some models echo back from the prompt.
      const result =
        input.actionInput.action === 'improve_block' ? sanitizeImproveBlockOutput(raw) : raw;
      await this.writeAuditLog(input.doctorId, action, status);
      return { result };
    } catch (err) {
      status = 'error';
      await this.writeAuditLog(input.doctorId, action, status);
      throw err;
    }
  }

  /**
   * Sends a prescription transcript to the AI model and parses the structured
   * medications from the JSON response.
   *
   * Robust parsing rules:
   *   - Strips ```json … ``` fences before parsing.
   *   - If the response is not a valid JSON array, returns [] (never throws 500).
   *   - Each element is sanitized: unknown keys are dropped, all fields coerced to string.
   */
  private async executeParsePrescription(
    content: string,
    doctorId: string,
  ): Promise<ParsePrescriptionOutputDto> {
    const prompt = buildParsePrescriptionPrompt(content);
    let status = 'success';

    try {
      const raw = await this.textGenerator.generate(prompt);
      const medications = parseMedicationsResponse(raw);
      await this.writeAuditLog(doctorId, 'parse_prescription', status);
      return { medications };
    } catch (err) {
      status = 'error';
      await this.writeAuditLog(doctorId, 'parse_prescription', status);
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
 * Removes a leading parenthetical field-name echo that some models copy from
 * the prompt, plus any wrapping quotation marks.
 *
 * Examples stripped:
 *   "(chief_complaint) El paciente..." → "El paciente..."
 *   "(Motivo de consulta): El paciente..." → "El paciente..."
 *   '"El paciente..."'  → "El paciente..."
 *
 * Exported for testing.
 */
export function sanitizeImproveBlockOutput(raw: string): string {
  // Step 1: strip wrapping quotes (single, double, or typographic).
  let text = raw
    .trim()
    .replace(/^["'«""]([\s\S]*?)["'»""]$/u, '$1')
    .trim();

  // Step 2: strip a leading parenthesised label "(anything) :?" at the start.
  // Matches patterns like: (chief_complaint), (Motivo de consulta):, (Label) —
  text = text.replace(/^\s*\([^)]{1,120}\)\s*:?\s*/u, '').trim();

  return text;
}

/**
 * Returns the mode-specific instruction prefix that frames the rewriting goal.
 * This is injected into the prompt BEFORE the block-specific instruction so
 * the model understands the overarching task.
 */
function getModeInstruction(mode: ImproveBlockMode): string {
  switch (mode) {
    case 'formal':
      return 'Reescribe el siguiente texto clínico elevando el registro a un tono formal y protocolar, propio de un informe médico oficial. Usa prosa continua, vocabulario técnico preciso, tercera persona gramatical, y oraciones completas y bien articuladas.';
    case 'shorten':
      return 'Sintetiza el siguiente texto clínico en una versión más breve, conservando íntegramente toda la información clínica relevante. Usa tono formal, tercera persona y oraciones completas. Elimina redundancias y palabras innecesarias, pero no omitas ningún dato clínico.';
    case 'lengthen':
      return 'Desarrolla y amplía el siguiente texto clínico con mayor precisión semiológica y estructura formal. Usa tono profesional, tercera persona y oraciones completas. NO inventes datos clínicos que no estén implícitos en el texto original; amplía con estructura, terminología y detalle descriptivo.';
    case 'improve':
    default:
      return 'Reescribe el siguiente texto clínico en prosa formal y profesional. Usa tercera persona gramatical, oraciones completas y bien construidas, y vocabulario médico apropiado. El resultado debe sonar como una nota clínica redactada por un médico, no como un dictado informal.';
  }
}

/**
 * Builds the improve_block prompt.
 * Exported for testing.
 */
export function buildBlockPrompt(
  blockKey: string,
  _blockLabel: string,
  content: string,
  mode: ImproveBlockMode = 'improve',
): string {
  const modeInstruction = getModeInstruction(mode);
  const blockInstruction = getBlockInstruction(blockKey);
  const cleanContent = stripHtml(content);

  // Key design decisions (tasks 1a + 2):
  //   - The label is mentioned only in the block-specific instruction context,
  //     NOT embedded directly adjacent to the content text, to avoid the model
  //     repeating it in the output.
  //   - The output constraint ("devuelve ÚNICAMENTE") is explicit and placed
  //     immediately before the content section, not buried in the middle.
  //   - "Contenido a mejorar:" separates the instruction from the text clearly.
  return [
    `Eres un asistente de redacción médica profesional. ${modeInstruction}`,
    ``,
    `Instrucción específica para este campo: ${blockInstruction}`,
    ``,
    `REGLAS DE SALIDA — respétalas sin excepción:`,
    `• Devuelve ÚNICAMENTE el texto clínico reescrito.`,
    `• NO incluyas el nombre del campo, ni encabezados, ni etiquetas, ni paréntesis con nombres de campos.`,
    `• NO incluyas explicaciones, aclaraciones, ni comillas envolventes.`,
    `• Conserva TODA la información clínica del original — no inventes datos inexistentes.`,
    `• Responde en español (Venezuela).`,
    ``,
    `Contenido a mejorar:`,
    cleanContent,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// parse_prescription helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Builds the prompt sent to the model for the parse_prescription action.
 *
 * Design decisions:
 *   - Instructs the model to output ONLY a JSON array — no surrounding text.
 *   - Unknown or unmentioned fields must be empty strings, not invented values.
 *   - Spanish (Venezuela) as the output language.
 */
export function buildParsePrescriptionPrompt(transcript: string): string {
  return [
    'Eres un asistente médico. Analiza la siguiente transcripción de una consulta dictada por un médico',
    'y extrae TODOS los medicamentos mencionados.',
    '',
    'Devuelve ÚNICAMENTE un arreglo JSON (sin texto antes ni después, sin bloques de código markdown)',
    'donde cada elemento tiene exactamente estos campos:',
    '  name         — nombre del medicamento (genérico o comercial)',
    '  dose         — dosis (ej: "500 mg", "10 mg/ml")',
    '  route        — vía de administración (ej: "oral", "intravenosa", "tópica")',
    '  frequency    — frecuencia (ej: "cada 8 horas", "una vez al día")',
    '  duration     — duración del tratamiento (ej: "7 días", "10 días")',
    '  presentation — presentación farmacéutica (ej: "tabletas", "cápsulas", "jarabe")',
    '',
    'REGLAS ESTRICTAS:',
    '• Si un campo no se menciona en la transcripción, devuélvelo como cadena vacía "". NO inventes datos.',
    '• Responde SOLO el JSON. Ningún texto adicional, ninguna explicación, ningún bloque ```json```.',
    '• Si no hay medicamentos, devuelve un arreglo vacío: []',
    '• Responde en español (Venezuela).',
    '',
    'Transcripción:',
    transcript,
  ].join('\n');
}

/**
 * Parses the raw AI response for parse_prescription.
 *
 * Strips optional ```json … ``` fences, then JSON.parse the result.
 * If parsing fails or the result is not an array, returns [].
 * Each element is coerced: unknown keys are dropped, all required fields
 * are set to string (defaulting to "" when absent or non-string).
 *
 * Exported for unit testing.
 */
export function parseMedicationsResponse(raw: string): ParsedMedication[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/u, '')
    .replace(/\s*```$/u, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return (parsed as unknown[]).flatMap((item): ParsedMedication[] => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const obj = item as Record<string, unknown>;
    return [
      {
        name: typeof obj['name'] === 'string' ? obj['name'] : '',
        dose: typeof obj['dose'] === 'string' ? obj['dose'] : '',
        route: typeof obj['route'] === 'string' ? obj['route'] : '',
        frequency: typeof obj['frequency'] === 'string' ? obj['frequency'] : '',
        duration: typeof obj['duration'] === 'string' ? obj['duration'] : '',
        presentation: typeof obj['presentation'] === 'string' ? obj['presentation'] : '',
      },
    ];
  });
}

function getBlockInstruction(blockKey: string): string {
  switch (blockKey) {
    case 'chief_complaint':
      return 'Motivo de consulta: reescribe en prosa clínica estructurando los síntomas con tiempo de evolución, intensidad y factores asociados cuando estén presentes en el original.';
    case 'history':
      return 'Antecedentes: organiza en categorías (personales, familiares, quirúrgicos, alérgicos, hábitos) cuando aplique; usa terminología médica estandarizada.';
    case 'physical_exam':
      return 'Examen físico: estructura los hallazgos por sistemas (general, cardiopulmonar, abdominal, neurológico, etc.) usando terminología semiológica precisa.';
    case 'diagnosis':
      return 'Diagnóstico clínico: usa terminología CIE-10 cuando sea posible; distingue diagnóstico principal de secundarios o diferenciales si los hay en el original.';
    case 'treatment':
      return 'Plan terapéutico: estructura el tratamiento (farmacológico, no farmacológico, medidas generales) de forma clara y jerarquizada.';
    case 'prescription':
      return 'Prescripción médica: incluye SOLO los datos que el médico dictó (nombre, dosis, vía, frecuencia, duración). NUNCA inventes ni completes con valores "típicos/habituales" un dato que no se dijo (p. ej. no agregues una frecuencia ni un "tomar con alimentos" si no se mencionó); si falta alguno, márcalo como "(por especificar)" para que el médico lo complete. Mantén formato profesional de receta.';
    case 'rest':
      return 'Reposo indicado: especifica tipo (absoluto/relativo/laboral), duración y motivo clínico de forma profesional.';
    case 'tasks':
      return 'Tareas terapéuticas: redacta instrucciones claras, accionables y medibles para que el paciente las ejecute.';
    case 'nutrition_plan':
      return 'Plan alimenticio: estructura por comidas (desayuno, merienda, almuerzo, cena); enfatiza balance nutricional, porciones, alimentos recomendados y a evitar.';
    case 'exercises':
      return 'Rutina de ejercicios: especifica tipo de ejercicio, series, repeticiones, frecuencia semanal, progresión y precauciones cuando apliquen en el original.';
    case 'indications':
      return 'Indicaciones generales: usa lenguaje claro; lista los puntos cuando sean varios y enfatiza signos de alarma si los hay.';
    case 'recommendations':
      return 'Recomendaciones complementarias: sé práctico y accionable; prioriza lo más importante para el seguimiento del paciente.';
    case 'requested_exams':
      return 'Exámenes solicitados: usa el nombre completo y estandarizado de cada estudio (laboratorio, imagen, especiales); agrupa por tipo cuando aplique.';
    case 'next_followup':
      return 'Próxima cita/control: especifica fecha aproximada, motivo del control y qué debe traer el paciente si aplica.';
    case 'internal_notes':
      return 'Notas internas del médico (privadas, no se comparten con el paciente): sé directo, técnico y enfócate en seguimiento, pendientes y consideraciones clínicas relevantes.';
    default:
      return 'Campo clínico: reescríbelo de manera profesional, clara y estructurada según el contexto clínico implícito.';
  }
}
