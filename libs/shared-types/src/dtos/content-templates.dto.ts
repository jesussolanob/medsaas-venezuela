import { z } from 'zod';

// ---------------------------------------------------------------------------
// Per-type content schemas (content_templates and standalone_documents share
// the same shapes per type, except reposo which gains from/to in documents)
// ---------------------------------------------------------------------------

// Medication inside a recipe
export const MedicationSchema = z
  .object({
    name: z.string().min(1, 'El nombre del medicamento es requerido').max(300),
    dose: z.string().max(200).default(''),
    route: z.string().max(200).default(''),
    frequency: z.string().max(200).default(''),
    duration: z.string().max(200).default(''),
    presentation: z.string().max(200).default(''),
    indications: z.string().max(500).default(''),
  })
  .strict();
export type Medication = z.infer<typeof MedicationSchema>;

// Recipe content: up to 50 medications + free-text notes
export const RecipeContentSchema = z
  .object({
    medications: z.array(MedicationSchema).min(0).max(50, 'Máximo 50 medicamentos por plantilla'),
    notes: z.string().max(2000).default(''),
  })
  .strict();
export type RecipeContent = z.infer<typeof RecipeContentSchema>;

// Paraclinical exam item
export const ParaclinicalItemSchema = z
  .object({
    exam_name: z.string().min(1, 'El nombre del examen es requerido').max(300),
    notes: z.string().max(500).default(''),
  })
  .strict();
export type ParaclinicalItem = z.infer<typeof ParaclinicalItemSchema>;

// Paraclinical content: up to 50 exam items
export const ParaclinicalContentSchema = z
  .object({
    items: z.array(ParaclinicalItemSchema).min(0).max(50, 'Máximo 50 exámenes por plantilla'),
  })
  .strict();
export type ParaclinicalContent = z.infer<typeof ParaclinicalContentSchema>;

// Reposo template content: diagnosis + duration (no from/to — dates are usage-time)
export const ReposoTemplateContentSchema = z
  .object({
    diagnosis: z.string().max(500).default(''),
    days: z.number().int().min(1, 'Mínimo 1 día').max(365, 'Máximo 365 días'),
    comments: z.string().max(1000).default(''),
  })
  .strict();
export type ReposoTemplateContent = z.infer<typeof ReposoTemplateContentSchema>;

// Reposo document content: includes from/to dates (YYYY-MM-DD)
export const ReposoDocumentContentSchema = z
  .object({
    diagnosis: z.string().max(500).default(''),
    days: z.number().int().min(1, 'Mínimo 1 día').max(365, 'Máximo 365 días'),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD requerido'),
    comments: z.string().max(1000).default(''),
  })
  .strict();
export type ReposoDocumentContent = z.infer<typeof ReposoDocumentContentSchema>;

// Presupuesto template item (no unit_price_usd for service/product — resolved live)
export const PresupuestoTemplateItemSchema = z
  .object({
    kind: z.enum(['service', 'product', 'manual']),
    source_id: z.string().uuid().optional().nullable(),
    name: z.string().min(1, 'El nombre del ítem es requerido').max(300),
    description: z.string().max(1000).default(''),
    quantity: z.number().positive('La cantidad debe ser mayor a cero').max(9999).finite(),
    /** Only for manual items — service/product price is resolved at apply time */
    unit_price_usd: z.number().nonnegative().max(9_999_999).finite().optional().nullable(),
  })
  .strict()
  .refine((it) => it.kind !== 'manual' || !it.source_id, {
    message: 'Un ítem manual no puede tener un source_id',
    path: ['source_id'],
  });
export type PresupuestoTemplateItem = z.infer<typeof PresupuestoTemplateItemSchema>;

// Presupuesto template content: up to 100 items
export const PresupuestoTemplateContentSchema = z
  .object({
    items: z.array(PresupuestoTemplateItemSchema).min(0).max(100, 'Máximo 100 ítems por plantilla'),
  })
  .strict();
export type PresupuestoTemplateContent = z.infer<typeof PresupuestoTemplateContentSchema>;

// ---------------------------------------------------------------------------
// Content template type
// ---------------------------------------------------------------------------

export const ContentTemplateTypeSchema = z.enum([
  'recipe',
  'paraclinical',
  'reposo',
  'presupuesto',
]);
export type ContentTemplateType = z.infer<typeof ContentTemplateTypeSchema>;

// ---------------------------------------------------------------------------
// Create content template DTO
// ---------------------------------------------------------------------------

export const CreateContentTemplateDtoSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('recipe'),
    name: z.string().trim().min(1, 'El nombre es requerido').max(120),
    content: RecipeContentSchema,
  }),
  z.object({
    type: z.literal('paraclinical'),
    name: z.string().trim().min(1, 'El nombre es requerido').max(120),
    content: ParaclinicalContentSchema,
  }),
  z.object({
    type: z.literal('reposo'),
    name: z.string().trim().min(1, 'El nombre es requerido').max(120),
    content: ReposoTemplateContentSchema,
  }),
  z.object({
    type: z.literal('presupuesto'),
    name: z.string().trim().min(1, 'El nombre es requerido').max(120),
    content: PresupuestoTemplateContentSchema,
  }),
]);
export type CreateContentTemplateDto = z.infer<typeof CreateContentTemplateDtoSchema>;

// ---------------------------------------------------------------------------
// Update content template DTO (type is immutable)
// ---------------------------------------------------------------------------

export const UpdateContentTemplateDtoSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es requerido').max(120).optional(),
    // Pre-parsed as union here; cross-type validation (ensuring the content matches the
    // stored template type) is enforced in UpdateContentTemplateUseCase.
    content: z
      .union([
        RecipeContentSchema,
        ParaclinicalContentSchema,
        ReposoTemplateContentSchema,
        PresupuestoTemplateContentSchema,
      ])
      .optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.content !== undefined, {
    message: 'Debe proporcionar al menos name o content',
  });
export type UpdateContentTemplateDto = z.infer<typeof UpdateContentTemplateDtoSchema>;

// ---------------------------------------------------------------------------
// List content templates query
// ---------------------------------------------------------------------------

export const ListContentTemplatesQuerySchema = z
  .object({
    type: ContentTemplateTypeSchema.optional(),
  })
  .strict();
export type ListContentTemplatesQuery = z.infer<typeof ListContentTemplatesQuerySchema>;

// ---------------------------------------------------------------------------
// Standalone document type (no presupuesto — those stay in quotes)
// ---------------------------------------------------------------------------

export const StandaloneDocumentTypeSchema = z.enum(['recipe', 'paraclinical', 'reposo']);
export type StandaloneDocumentType = z.infer<typeof StandaloneDocumentTypeSchema>;

export const StandaloneDocumentStatusSchema = z.enum(['draft', 'issued', 'voided']);
export type StandaloneDocumentStatus = z.infer<typeof StandaloneDocumentStatusSchema>;

// ---------------------------------------------------------------------------
// Create standalone document (draft) DTO — discriminated by type
// ---------------------------------------------------------------------------

export const CreateStandaloneDocumentDtoSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('recipe'),
    patient_id: z.string().uuid('patient_id debe ser un UUID válido'),
    content: RecipeContentSchema,
  }),
  z.object({
    type: z.literal('paraclinical'),
    patient_id: z.string().uuid('patient_id debe ser un UUID válido'),
    content: ParaclinicalContentSchema,
  }),
  z.object({
    type: z.literal('reposo'),
    patient_id: z.string().uuid('patient_id debe ser un UUID válido'),
    content: ReposoDocumentContentSchema,
  }),
]);
export type CreateStandaloneDocumentDto = z.infer<typeof CreateStandaloneDocumentDtoSchema>;

// ---------------------------------------------------------------------------
// Update standalone document content (draft only)
// ---------------------------------------------------------------------------

export const UpdateStandaloneDocumentDtoSchema = z
  .object({
    // Pre-parsed as union here; cross-type validation (ensuring the content matches the
    // stored document type) is enforced in UpdateStandaloneDocumentUseCase.
    content: z.union([RecipeContentSchema, ParaclinicalContentSchema, ReposoDocumentContentSchema]),
  })
  .strict();
export type UpdateStandaloneDocumentDto = z.infer<typeof UpdateStandaloneDocumentDtoSchema>;

// ---------------------------------------------------------------------------
// Void document DTO
// ---------------------------------------------------------------------------

export const VoidStandaloneDocumentDtoSchema = z
  .object({
    reason: z.string().max(500).optional().nullable(),
  })
  .strict();
export type VoidStandaloneDocumentDto = z.infer<typeof VoidStandaloneDocumentDtoSchema>;

// ---------------------------------------------------------------------------
// List standalone documents query
// ---------------------------------------------------------------------------

export const ListStandaloneDocumentsQuerySchema = z
  .object({
    patient_id: z.string().uuid().optional(),
    type: StandaloneDocumentTypeSchema.optional(),
    status: StandaloneDocumentStatusSchema.optional(),
    /** Maximum records to return. Default 200, hard cap 500. */
    limit: z.coerce.number().int().min(1).max(500).default(200),
    /** Number of records to skip. Default 0. */
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type ListStandaloneDocumentsQuery = z.infer<typeof ListStandaloneDocumentsQuerySchema>;
