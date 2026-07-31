'use strict';

/**
 * Migration: add welcome_dismissed_at to profiles.
 *
 * Marca de tiempo en la que el especialista pidió no volver a ver el modal de
 * bienvenida (el tour breve de los módulos). NULL = nunca lo descartó, así que
 * el modal se le muestra al entrar.
 *
 * Se deja NULL para TODOS los perfiles existentes a propósito: la decisión de
 * producto es que los especialistas que ya usan el sistema también vean el tour
 * una vez, no solo los nuevos.
 *
 * Additive only.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('profiles', 'welcome_dismissed_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      comment:
        'When the specialist chose "do not show again" on the welcome tour. NULL = show it.',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('profiles', 'welcome_dismissed_at');
  },
};
