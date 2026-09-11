import { AppointmentStatusSchema, APPOINTMENT_STATUS_LABELS } from '@delta/shared-types';
import { nombreDeEstado, ESTADOS_FINALES } from './appointment-status-names';
import { allowedAppointmentTransitions } from '@delta/shared-types';

/**
 * Dos vocabularios para lo mismo ya costó una sesión entera en este proyecto
 * (ver ADR-072, métodos de pago). Acá conviven a propósito dos formas del mismo
 * nombre: la del backend es para meterla en una oración ("una cita agendada") y
 * la de `@delta/shared-types` es para una etiqueta de pantalla ("Agendada").
 *
 * Que difieran en mayúscula está bien. Que difieran en COBERTURA no: si alguien
 * agrega un estado nuevo al enum y se olvida de uno de los dos mapas, el texto
 * que lee la especialista vuelve a mostrar la clave interna en inglés. Estos
 * tests existen para que ese olvido rompa la suite en vez de llegar a pantalla.
 */
describe('vocabulario de estados de cita', () => {
  const TODOS = AppointmentStatusSchema.options;

  it('el backend tiene nombre para TODOS los estados del enum', () => {
    for (const estado of TODOS) {
      // Si falta, nombreDeEstado devuelve la clave cruda tal cual.
      expect(nombreDeEstado(estado)).not.toBe(estado);
    }
  });

  it('shared-types tiene etiqueta para TODOS los estados del enum', () => {
    for (const estado of TODOS) {
      expect(APPOINTMENT_STATUS_LABELS[estado]).toBeTruthy();
    }
  });

  it('un estado final es exactamente un estado sin transiciones de salida', () => {
    for (const estado of TODOS) {
      const sinSalida = allowedAppointmentTransitions(estado).length === 0;
      // 'pending' y 'accepted' son legado: no tienen salida pero tampoco son un
      // desenlace que la especialista haya elegido, así que no son "finales".
      if (estado === 'pending' || estado === 'accepted') continue;
      expect(ESTADOS_FINALES.has(estado)).toBe(sinSalida);
    }
  });
});
