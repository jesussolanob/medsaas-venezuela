import { AppointmentNotReschedulableError } from './appointment-not-reschedulable.error';

/**
 * El `GlobalExceptionFilter` reenvía el mensaje tal cual al navegador: esto es
 * literalmente el texto que lee una especialista. Salía entero en inglés
 * («Cannot reschedule an appointment in status "completed"...») dentro de una
 * interfaz en español.
 */
describe('AppointmentNotReschedulableError', () => {
  it('es 409 y conserva su código', () => {
    const error = new AppointmentNotReschedulableError('completed');
    expect(error.httpStatus).toBe(409);
    expect(error.code).toBe('APPOINTMENT_NOT_RESCHEDULABLE');
  });

  it.each(['completed', 'cancelled', 'no_show'])(
    'para un estado final (%s) explica que la cita está cerrada y ofrece la salida',
    (estado) => {
      const { message } = new AppointmentNotReschedulableError(estado);

      expect(message).toContain('cita nueva');
      expect(message).not.toMatch(/[Cc]annot|appointment|status/);
    },
  );

  it('nombra el estado con las palabras de la pantalla, no con la clave interna', () => {
    // 'completed' es "atendida" en la taxonomía de CLAUDE.md, no "completada".
    expect(new AppointmentNotReschedulableError('completed').message).toContain('atendida');
    expect(new AppointmentNotReschedulableError('cancelled').message).toContain('cancelada');
  });

  it('para un estado no final dice simplemente que no se puede', () => {
    const { message } = new AppointmentNotReschedulableError('pending');
    expect(message).toContain('pendiente');
    expect(message).not.toContain('cita nueva');
  });

  it('no rompe con un estado desconocido: usa la clave cruda', () => {
    // AppointmentStatus puede crecer; es preferible leer 'rejected' a que el
    // mensaje quede sin el dato.
    expect(new AppointmentNotReschedulableError('rejected').message).toContain('rejected');
  });
});
