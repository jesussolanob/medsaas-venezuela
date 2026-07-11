'use strict';

/**
 * Migration: 20260711000001-consultation-blocks-recipe-enabled
 *
 * Aplica correcciones idempotentes al catálogo de bloques de consulta:
 *
 *   1. consultation_block_catalog:
 *      - Renombra 'Prescripción' → 'Récipe' para la clave 'prescription'.
 *      - Habilita default_enabled=true para los 7 bloques fijos:
 *        chief_complaint, history, diagnosis, prescription,
 *        indications, paraclinical, rest.
 *
 *   2. specialty_default_blocks:
 *      - Habilita enabled=true para esos mismos bloques fijos.
 *      - Asigna sort_order canónico (0-6) en el orden:
 *        chief_complaint(0), history(1), diagnosis(2), prescription(3),
 *        indications(4), paraclinical(5), rest(6).
 *        Los bloques no-fijos conservan el sort_order que tenían.
 *
 * Totalmente idempotente — usa UPDATE … WHERE (no INSERT).
 * El bloque 'paraclinical' fue insertado por la migración
 * 20260710000000-paraclinico-block.cjs, por lo que ya existe en prod.
 *
 * down(): revierte solo el renombre de label (Récipe → Prescripción).
 * No se revierten default_enabled ni sort_order porque hacerlo
 * requeriría conocer los valores anteriores de cada fila, lo cual es riesgoso.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // 1. Renombrar label 'Prescripción' → 'Récipe'
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_label = 'Récipe'
       WHERE key = 'prescription'
         AND default_label = 'Prescripción'
    `);

    // 2. Habilitar default_enabled para los 7 bloques fijos
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_enabled = true
       WHERE key IN (
         'chief_complaint',
         'history',
         'diagnosis',
         'prescription',
         'indications',
         'paraclinical',
         'rest'
       )
    `);

    // 3. Habilitar + asignar sort_order canónico en specialty_default_blocks.
    //    Actualizamos de a un bloque para claridad; cada UPDATE afecta todas
    //    las especialidades que tengan ese block_key.

    // chief_complaint → sort_order 0
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 0
       WHERE block_key = 'chief_complaint'
    `);

    // history → sort_order 1
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 1
       WHERE block_key = 'history'
    `);

    // diagnosis → sort_order 2
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 2
       WHERE block_key = 'diagnosis'
    `);

    // prescription → sort_order 3
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 3
       WHERE block_key = 'prescription'
    `);

    // indications → sort_order 4
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 4
       WHERE block_key = 'indications'
    `);

    // paraclinical → sort_order 5
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 5
       WHERE block_key = 'paraclinical'
    `);

    // rest → sort_order 6
    await q.query(`
      UPDATE specialty_default_blocks
         SET enabled = true, sort_order = 6
       WHERE block_key = 'rest'
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Revertir solo el renombre de label (lo demás es riesgoso de revertir).
    await q.query(`
      UPDATE consultation_block_catalog
         SET default_label = 'Prescripción'
       WHERE key = 'prescription'
         AND default_label = 'Récipe'
    `);
  },
};
