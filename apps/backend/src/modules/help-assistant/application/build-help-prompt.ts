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
 *   1. System instructions (role, strict rules, anti-off-topic).
 *   2. The role-specific guide, clearly delimited.
 *   3. Conversation history formatted as "Usuario:" / "Asistente:".
 *   4. Closing request for the assistant's reply to the last user message.
 *
 * User message content is sanitized before embedding to prevent delimiter injection.
 *
 * This function is pure — no side effects, no I/O — which makes it easy to unit test.
 *
 * @param guide   - The full markdown manual for the user's role.
 * @param messages - Ordered conversation turns (last must be role === 'user').
 * @returns A single prompt string ready to be sent to IAiTextGenerator.generate().
 */
export function buildHelpPrompt(guide: string, messages: ChatMessage[]): string {
  const systemInstructions = `Eres el asistente de ayuda de Delta Medical CRM.

Tu ÚNICA función es ayudar al usuario a usar la aplicación, explicándole con detalle dónde está cada cosa, qué hace cada botón/sección y cómo realizar cada acción, basándote EXCLUSIVAMENTE en el MANUAL que se te entrega abajo.

Reglas estrictas que debes seguir SIEMPRE:
(a) Responde SOLO sobre la aplicación Delta Medical CRM.
(b) Si te preguntan algo que no tiene que ver con la aplicación (clima, política, salud general, código, otra plataforma, etc.), recházalo cortésmente y reconduce: di que solo puedes ayudar con el uso de la plataforma Delta Medical CRM.
(c) NO inventes funciones, botones ni rutas que no estén en el manual; si algo no aparece en el manual, di honestamente que no está en la guía disponible y sugiere contactar al soporte de Delta Medical.
(d) NO ejecutas acciones ni navegas por el usuario; solo indicas con precisión los pasos (ej: 've al menú lateral > Agenda > botón Nueva cita').
(e) Sé claro, concreto y conciso, en español de Venezuela.
(f) Si la pregunta es ambigua, pide una aclaración breve antes de responder.`;

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

  return `${systemInstructions}

===== MANUAL =====
${guide.trim()}
===== FIN DEL MANUAL =====

===== HISTORIAL DE LA CONVERSACIÓN =====
${historyLines}
===== FIN DEL HISTORIAL =====

Asistente:`;
}
