'use strict';

/**
 * Migration: 20260714000001-catalog-default-sort-order-and-unified-defaults
 *
 * Establece un orden default unificado para TODOS los doctores/especialidades:
 *
 *   1. Agrega la columna `default_sort_order` (integer, NOT NULL, DEFAULT 99)
 *      a `consultation_block_catalog`.
 *
 *   2. Renombra dos labels globales:
 *      - 'requested_exams' → 'Referencia'
 *      - 'treatment'       → 'Tratamiento propuesto'
 *
 *   3. Setea `default_sort_order` y `default_enabled` para los 16 bloques conocidos
 *      (sort 0-15, primeros 7 enabled=true, resto false).
 *      NOTA: no se toca `updated_at` — la tabla no tiene esa columna.
 *
 *   4. Elimina todas las filas de `specialty_default_blocks` (DELETE FROM).
 *      Así toda especialidad usa el default del catálogo directamente.
 *      El re-seed de specialty_default_blocks NO se revierte en down() —
 *      igual que otras migraciones de datos del repo (ej. 20260711000001).
 *
 * Totalmente idempotente: ADD COLUMN usa IF NOT EXISTS; los UPDATEs son sin
 * condición de "valor anterior" (idempotentes por naturaleza).
 *
 * down():
 *   - Elimina la columna `default_sort_order`.
 *   - No restaura los labels renombrados (riesgoso, pueden haber cambiado).
 *   - No restaura specialty_default_blocks (ver nota arriba).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;

    // 1. Agregar columna default_sort_order (idempotente con IF NOT EXISTS)
    await q.query(`
      ALTER TABLE consultation_block_catalog
        ADD COLUMN IF NOT EXISTS default_sort_order integer NOT NULL DEFAULT 99
    `);

    // 2. Renombrar labels globales
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_label = 'Referencia'
       WHERE key = 'requested_exams'
    `);

    await q.query(`
      UPDATE consultation_block_catalog
         SET default_label = 'Tratamiento propuesto'
       WHERE key = 'treatment'
    `);

    // 3. Setear default_sort_order + default_enabled por bloque
    //    Primeros 7 (sort 0-6): enabled=true — núcleo de toda consulta.
    //    Resto (sort 7-15): enabled=false — disponibles pero inactivos por defecto.

    // sort 0 — chief_complaint (Motivo de consulta)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 0, default_enabled = true
       WHERE key = 'chief_complaint'
    `);

    // sort 1 — history (Historia clínica)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 1, default_enabled = true
       WHERE key = 'history'
    `);

    // sort 2 — physical_exam (Examen físico)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 2, default_enabled = true
       WHERE key = 'physical_exam'
    `);

    // sort 3 — indications (Evaluación actual)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 3, default_enabled = true
       WHERE key = 'indications'
    `);

    // sort 4 — diagnosis (Diagnóstico)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 4, default_enabled = true
       WHERE key = 'diagnosis'
    `);

    // sort 5 — prescription (Récipe)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 5, default_enabled = true
       WHERE key = 'prescription'
    `);

    // sort 6 — paraclinical (Paraclínico)
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 6, default_enabled = true
       WHERE key = 'paraclinical'
    `);

    // sort 7 — requested_exams (Referencia) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 7, default_enabled = false
       WHERE key = 'requested_exams'
    `);

    // sort 8 — treatment (Tratamiento propuesto) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 8, default_enabled = false
       WHERE key = 'treatment'
    `);

    // sort 9 — rest (Reposo) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 9, default_enabled = false
       WHERE key = 'rest'
    `);

    // sort 10 — next_followup (Próximo control) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 10, default_enabled = false
       WHERE key = 'next_followup'
    `);

    // sort 11 — recommendations (Recomendaciones) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 11, default_enabled = false
       WHERE key = 'recommendations'
    `);

    // sort 12 — exercises (Ejercicios) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 12, default_enabled = false
       WHERE key = 'exercises'
    `);

    // sort 13 — nutrition_plan (Plan nutricional) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 13, default_enabled = false
       WHERE key = 'nutrition_plan'
    `);

    // sort 14 — tasks (Tareas) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 14, default_enabled = false
       WHERE key = 'tasks'
    `);

    // sort 15 — internal_notes (Notas internas) — disabled by default
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_sort_order = 15, default_enabled = false
       WHERE key = 'internal_notes'
    `);

    // 4. Unificar: eliminar todos los defaults por especialidad.
    //    A partir de aquí toda especialidad usa el default del catálogo.
    await q.query(`DELETE FROM specialty_default_blocks`);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Eliminar la columna default_sort_order.
    await q.query(`
      ALTER TABLE consultation_block_catalog
        DROP COLUMN IF EXISTS default_sort_order
    `);

    // Los labels renombrados y el vaciado de specialty_default_blocks
    // NO se revierten — igual que otras migraciones de datos del repo
    // (ej. 20260711000001). Revertirlos requeriría conocer el estado
    // previo de cada fila, lo cual es riesgoso en producción.
  },
};
