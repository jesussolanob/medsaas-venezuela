import { AppointmentNotReschedulableError } from './appointment-not-reschedulable.error';
import { AppointmentInvalidTransitionError } from './appointment-invalid-transition.error';
import { AppointmentDuplicateError } from './appointment-duplicate.error';
import { AppointmentConflictError } from './appointment-conflict.error';

/**
 * Estos mensajes NO son detalle interno: el `GlobalExceptionFilter` los reenvía
 * tal cual al navegador, así que son literalmente lo que lee el especialista.
 *
 * No existía ninguna prueba sobre ellos, y por eso dos quedaron en inglés
 * durante meses sin que nada se pusiera rojo. Lo que sigue fija el idioma y,
 * sobre todo, que no vuelvan a filtrarse claves internas ni identificadores.
 */
describe('Mensajes de error de citas (los ve el especialista)', () => {
  /** Palabras que delatan una clave interna filtrada al texto visible. */
  const CLAVES_INTERNAS = [
    'scheduled',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'Cannot',
    'appointment',
    'Patient',
  ];

  function noFiltraClavesInternas(mensaje: string): void {
    for (const clave of CLAVES_INTERNAS) {
      expect(mensaje).not.toContain(clave);
    }
  }

  describe('AppointmentNotReschedulableError', () => {
    it('explica en español que una cita cerrada no se mueve de fecha', () => {
      const err = new AppointmentNotReschedulableError('completed');

      expect(err.message).toContain('atendida');
      expect(err.message).toContain('agendale una cita nueva');
      noFiltraClavesInternas(err.message);
    });

    it('nombra el estado en español cuando la cita no es final', () => {
      const err = new AppointmentNotReschedulableError('pending');

      expect(err.message).toBe('Una cita pendiente no se puede reagendar.');
    });

    it('responde 409', () => {
      expect(new AppointmentNotReschedulableError('completed').httpStatus).toBe(409);
    });
  });

  describe('AppointmentInvalidTransitionError', () => {
    it('deriva a soporte cuando la cita ya quedó cerrada', () => {
      const err = new AppointmentInvalidTransitionError('completed', 'no_show');

      expect(err.message).toContain('atendida');
      expect(err.message).toContain('soporte');
      noFiltraClavesInternas(err.message);
    });

    it('nombra ambos estados en español cuando la cita sigue abierta', () => {
      const err = new AppointmentInvalidTransitionError('scheduled', 'completed');

      expect(err.message).toBe('Una cita agendada no se puede pasar a atendida.');
    });
  });

  describe('AppointmentDuplicateError', () => {
    const CUANDO = new Date('2026-08-19T17:27:44.419Z');

    it('NUNCA expone el id del paciente', () => {
      const err = new AppointmentDuplicateError('9f1c2b3a-0000-4444-8888-abcdefabcdef', CUANDO);

      expect(err.message).not.toContain('9f1c2b3a');
      noFiltraClavesInternas(err.message);
    });

    it('muestra la hora legible en horario de Caracas, no el ISO crudo', () => {
      const err = new AppointmentDuplicateError('pac-1', CUANDO);

      // 17:27 UTC = 13:27 en Caracas (UTC-4).
      expect(err.message).toContain('01:27');
      expect(err.message).not.toContain('2026-08-19T17:27:44.419Z');
    });
  });

  describe('AppointmentConflictError', () => {
    it('muestra la hora legible y no el ISO crudo', () => {
      const err = new AppointmentConflictError(new Date('2026-08-19T17:27:44.419Z'));

      expect(err.message).toContain('01:27');
      expect(err.message).not.toContain('2026-08-19T17:27:44.419Z');
    });
  });
});
