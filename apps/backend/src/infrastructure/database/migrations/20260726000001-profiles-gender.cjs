'use strict';

/**
 * Migration: add gender column to profiles.
 *
 * El género del especialista no se pedía en ningún lado (ni onboarding ni
 * configuración). Se agrega con fines estadísticos.
 *
 * Valores: 'F' | 'M' | 'O' (otro) | 'N' (prefiere no decirlo). NULL = sin responder,
 * que es el estado de todos los perfiles existentes: la columna es opcional y NADA
 * en el sistema condiciona acceso, gating ni precios por este campo.
 *
 * Additive only: no toca datos existentes.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('profiles', 'gender', {
      type: Sequelize.STRING(1),
      allowNull: true,
      defaultValue: null,
      comment: "Specialist gender for statistics: F | M | O (other) | N (prefers not to say). NULL = unanswered.",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('profiles', 'gender');
  },
};
