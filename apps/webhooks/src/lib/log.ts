/**
 * Structured JSON logger compatible with Cloud Logging.
 *
 * Log only on errors — successful deliveries produce NO log line.
 * Never emit PII: no body content, phone numbers, names, signatures, tokens.
 */

type Severity = 'WARNING' | 'ERROR';

export interface LogFields {
  message: string;
  outcome?: 'bad_signature' | 'backend_error' | 'timeout' | 'too_large';
  backendStatus?: number;
  latencyMs?: number;
  eventId?: string;
  event?: string;
  reason?: string;
}

function emit(severity: Severity, fields: LogFields): void {
  const entry: Record<string, unknown> = { severity, ...fields };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export function logWarn(fields: LogFields): void {
  emit('WARNING', fields);
}

export function logError(fields: LogFields): void {
  emit('ERROR', fields);
}
