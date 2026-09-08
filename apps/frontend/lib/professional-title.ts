/**
 * Título profesional del especialista, para mostrarlo delante de su nombre.
 *
 * ⚠️ NO se infiere. Si el especialista no eligió un título, no se muestra ninguno.
 *
 * Antes esto derivaba el título de la especialidad (psicología → "Psic.",
 * odontología → "Odont.") y, si no reconocía la especialidad, caía en **"Dr."
 * fijo**. O sea que la app le adjudicaba un título a alguien que nunca lo eligió,
 * y en el peor caso le decía "Dr." a quien no lo es.
 *
 * En Venezuela eso no es un detalle cosmético: el título profesional está
 * asociado al ejercicio de una profesión y aparece en documentos que ve el
 * paciente —presupuestos, facturas, la página pública de reservas—. Mostrar
 * "Dr." junto al nombre de alguien que no lo eligió es afirmar algo sobre sus
 * credenciales que el sistema no tiene forma de saber.
 *
 * El campo es opcional a propósito y su lugar de carga es el perfil.
 */
export function getProfessionalTitle(title?: string | null): string {
  return title?.trim() || '';
}

/**
 * "Psic. Ana Pérez", o "Ana Pérez" a secas cuando no hay título cargado.
 *
 * Existe para que ningún lugar tenga que resolver el espacio a mano: pegar
 * `${titulo} ${nombre}` con el título vacío deja un espacio adelante, y ese
 * detalle se repetía en cinco pantallas.
 */
export function formatProfessionalName(
  title: string | null | undefined,
  fullName: string | null | undefined,
): string {
  const nombre = fullName?.trim() || '';
  const titulo = getProfessionalTitle(title);
  return [titulo, nombre].filter(Boolean).join(' ');
}
