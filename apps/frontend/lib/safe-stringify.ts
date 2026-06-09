/**
 * safeStringify — JSON.stringify with circular-reference protection and Error
 * serialization. Used by reportError to safely encode any value into a log line
 * without throwing and without leaking circular structures.
 *
 * Rules:
 *  - Circular references are replaced with the string '[Circular]'.
 *  - Error instances are serialized as { name, message, stack }.
 *  - If JSON.stringify itself throws for any other reason, falls back to String(value).
 */
export function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, val) => {
      // Serialize Error objects as a plain object so their fields are visible.
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      // Guard circular references — WeakSet only tracks object types.
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(value);
  }
}
