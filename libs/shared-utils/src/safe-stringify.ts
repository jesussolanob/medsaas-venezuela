/**
 * Safely serializes any value to a JSON string.
 *
 * - Handles circular references (replaces them with '[Circular]').
 * - Serializes Error instances as { name, message, stack }.
 * - Falls back to String(value) if JSON serialization returns undefined or fails entirely.
 */
export function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack,
    });
  }

  try {
    const seen = new WeakSet();
    const result = JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) {
          return '[Circular]';
        }
        seen.add(val);
      }
      return val;
    });

    // JSON.stringify returns undefined for undefined, functions, and symbols.
    if (result === undefined) {
      return String(value);
    }

    return result;
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}
