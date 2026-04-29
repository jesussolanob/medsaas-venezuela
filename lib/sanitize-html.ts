// AUDIT FIX 2026-04-28 (C-9): minimal HTML sanitizer for medical notes.
// Used in places that render rich-text fields (notes, diagnosis, treatment)
// via dangerouslySetInnerHTML. No external dependency.
//
// Strategy: parse-free regex sweep that
//   1) Strips <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>.
//   2) Removes any "on*" event-handler attribute.
//   3) Strips javascript:/data:/vbscript: URLs in href/src.
//   4) Removes <form>, <input>, <button>.
//
// This is a defense-in-depth layer for content that already SHOULD be coming
// from a controlled rich-text editor; it is not a substitute for a real DOM
// sanitizer if/when arbitrary user HTML is allowed.

const DANGEROUS_TAGS = /<(script|style|iframe|object|embed|link|meta|form|input|button|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi
const DANGEROUS_VOID_TAGS = /<(script|style|iframe|object|embed|link|meta|form|input|button|noscript)\b[^>]*\/?>/gi
const ON_HANDLER_ATTR = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const DANGEROUS_URL_ATTR = /\s(href|src|xlink:href|action|formaction|data|background|cite|poster)\s*=\s*("(?:\s*(?:javascript|data|vbscript):[^"]*)"|'(?:\s*(?:javascript|data|vbscript):[^']*)'|(?:\s*(?:javascript|data|vbscript):[^\s>]+))/gi
const SRCDOC_ATTR = /\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi

export function sanitizeHtml(input: unknown): string {
  if (input === null || input === undefined) return ''
  let html = String(input)
  html = html.replace(DANGEROUS_TAGS, '')
  html = html.replace(DANGEROUS_VOID_TAGS, '')
  html = html.replace(ON_HANDLER_ATTR, '')
  html = html.replace(DANGEROUS_URL_ATTR, '')
  html = html.replace(SRCDOC_ATTR, '')
  return html
}
