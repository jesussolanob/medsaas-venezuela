import type { ChatMessage } from './dtos/help-chat.dto';

/**
 * Neutralizes user-supplied content to prevent prompt-injection via delimiter strings
 * or fake conversation turns.
 *
 * Rules applied (in order):
 *   1. Sequences of 3 or more '=' characters are broken by inserting a zero-width
 *      non-joiner (U+200C) after the first two, making structural delimiters like
 *      '===== MANUAL =====' unrecognizable to the model.
 *   2. Lines that start with 'Usuario:' or 'Asistente:' (case-sensitive) are prefixed
 *      with a single space, preventing the injection of fake conversation turns.
 *
 * This function is pure and has no side effects.
 *
 * @param content - Raw message content from a user turn.
 * @returns Sanitized content safe to embed in the prompt.
 */
export function sanitizeMessageContent(content: string): string {
  // Break runs of 3+ '=' by inserting a zero-width non-joiner (U+200C) after
  // every '=' in the run, so no sub-sequence of 3+ consecutive '=' can remain.
  // Runs of 1 or 2 '=' are left untouched (common in markdown / comparisons).
  const withoutDelimiters = content.replace(/={3,}/g, (match) => {
    return match.split('').join('‌');
  });

  // Neutralize lines that start with role labels used in the prompt format.
  const withoutFakeTurns = withoutDelimiters
    .split('\n')
    .map((line) => {
      if (line.startsWith('Usuario:') || line.startsWith('Asistente:')) {
        return ` ${line}`;
      }
      return line;
    })
    .join('\n');

  return withoutFakeTurns;
}

/**
 * Builds the full prompt string sent to the AI provider for the help chat.
 *
 * Structure:
 *   1. System instructions (role, strict rules, plan-awareness, anti-off-topic).
 *   2. Optional user context block (plan + available/unavailable features) — only
 *      present when userContext is a non-empty string.
 *   3. The role-specific guide, clearly delimited.
 *   4. Conversation history formatted as "Usuario:" / "Asistente:".
 *   5. Closing request for the assistant's reply to the last user message.
 *
 * User message content is sanitized before embedding to prevent delimiter injection.
 *
 * This function is pure — no side effects, no I/O — which makes it easy to unit test.
 *
 * @param guide       - The full markdown manual for the user's role.
 * @param messages    - Ordered conversation turns (last must be role === 'user').
 * @param userContext - Optional plan-awareness context; omitted when undefined or empty.
 * @returns A single prompt string ready to be sent to IAiTextGenerator.generate().
 */
export function buildHelpPrompt(
  guide: string,
  messages: ChatMessage[],
  userContext?: string,
): string {
  const systemInstructions = `Eres el asistente de ayuda de Delta Medical CRM. Tu única función es ayudar al usuario a usar la aplicación: explicarle con precisión dónde está cada cosa, qué hace cada botón o sección y cómo realizar cada acción, basándote EXCLUSIVAMENTE en el MANUAL incluido más abajo.

Reglas:
- Tono PROFESIONAL, claro y conciso. Cordial pero formal. NO uses expresiones informales, coloquialismos ni regionalismos (por ejemplo: 'épale', 'mi pana', 'chévere', 'listo pues'). Evita signos de exclamación innecesarios. Español neutro de Venezuela.
- Responde SOLO sobre la aplicación Delta Medical CRM. Si te preguntan algo ajeno a la aplicación, declínalo cortésmente y reconduce: indica que solo puedes ayudar con el uso de la plataforma.
- Usa EXACTAMENTE los nombres de botones, menús y secciones tal como aparecen en el MANUAL. NUNCA inventes ni adaptes nombres de botones, secciones o rutas. Si no estás seguro del nombre exacto de un control, describe su ubicación en lugar de inventar un nombre.
- NUNCA menciones rutas ni URLs técnicas (por ejemplo '/doctor/upgrade', '/doctor/patients'). El usuario navega por la interfaz, no escribiendo direcciones. Guía SIEMPRE indicando la navegación por nombres de menús, secciones y botones (por ejemplo: 'en el menú lateral, abra Pacientes'). Las rutas que aparezcan en el MANUAL o en el contexto son solo referencia interna; no las muestres al usuario.
- Si una funcionalidad no aparece en el manual, dilo con honestidad y sugiere contactar a soporte.
- No ejecutas acciones ni navegas por el usuario; solo indicas los pasos con precisión.
- Respeta el plan del usuario: si más abajo aparece un bloque CONTEXTO DEL USUARIO, guía únicamente a través de los módulos DISPONIBLES en su plan. Si el usuario pregunta por un módulo que NO está disponible en su plan, NO le des los pasos como si lo tuviera; explícale que esa función no está incluida en su plan actual y que puede habilitarla mejorando su plan mediante la opción Mejorar, al pie del menú lateral.
- Si la pregunta es ambigua, pide una aclaración breve.
- Usa pasos numerados solo cuando aporten claridad. Sé breve.`;

  const historyLines = messages
    .map((msg) => {
      const label = msg.role === 'user' ? 'Usuario' : 'Asistente';
      // Sanitize user content to neutralize delimiter injection attempts.
      // Assistant turns come from the AI provider (trusted), but we sanitize
      // both for defense-in-depth in case history is tampered client-side.
      const safeContent = sanitizeMessageContent(msg.content);
      return `${label}: ${safeContent}`;
    })
    .join('\n');

  const contextBlock =
    userContext && userContext.trim()
      ? `\n===== CONTEXTO DEL USUARIO =====\n${userContext.trim()}\n===== FIN DEL CONTEXTO =====\n`
      : '';

  return `${systemInstructions}
${contextBlock}
===== MANUAL =====
${guide.trim()}
===== FIN DEL MANUAL =====

===== HISTORIAL DE LA CONVERSACIÓN =====
${historyLines}
===== FIN DEL HISTORIAL =====

Asistente:`;
}
