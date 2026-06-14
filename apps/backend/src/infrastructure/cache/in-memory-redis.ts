import { Logger } from '@nestjs/common';

/**
 * Minimal in-memory stand-in for the subset of ioredis commands used by the app
 * (get/set/setex/del/scan/ping). Lets the backend run with NO Redis server —
 * e.g. a low-cost test deploy — without connection churn or error-log spam.
 *
 * Enabled with REDIS_DISABLED=true (see {@link redis.module}).
 *
 * Caveats vs real Redis: the cache is per-process (not shared across Cloud Run
 * instances) and is lost on restart. That is acceptable for a CACHE — every
 * consumer already falls back to the database on a miss. NEVER use as a source
 * of truth.
 */
type Entry = { value: string; expireAt: number | null };

export class InMemoryRedis {
  private readonly store = new Map<string, Entry>();
  private readonly logger = new Logger('InMemoryRedis');

  constructor() {
    this.logger.warn(
      'Using in-memory cache (REDIS_DISABLED=true) — not shared across instances, lost on restart',
    );
  }

  private isExpired(entry: Entry): boolean {
    return entry.expireAt !== null && entry.expireAt <= Date.now();
  }

  private read(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key);
  }

  /** Supports `set(key, value)` and `set(key, value, 'EX'|'PX', ttl)`. */
  async set(key: string, value: string, mode?: string, ttl?: number): Promise<'OK'> {
    let expireAt: number | null = null;
    if (mode && ttl !== undefined) {
      const m = mode.toUpperCase();
      if (m === 'EX') expireAt = Date.now() + ttl * 1000;
      else if (m === 'PX') expireAt = Date.now() + ttl;
    }
    this.store.set(key, { value, expireAt });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, expireAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) removed += 1;
    }
    return removed;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  /**
   * Single-pass SCAN: returns every matching key with a terminal cursor ('0').
   * Callers loop until the cursor is '0', so one pass is correct for an
   * in-memory store. Supports `MATCH <glob>`; COUNT is accepted and ignored.
   */
  async scan(_cursor: string | number, ...args: (string | number)[]): Promise<[string, string[]]> {
    let pattern = '*';
    for (let i = 0; i < args.length - 1; i += 1) {
      if (String(args[i]).toUpperCase() === 'MATCH') pattern = String(args[i + 1]);
    }
    const regex = this.globToRegExp(pattern);
    const keys: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        continue;
      }
      if (regex.test(key)) keys.push(key);
    }
    return ['0', keys];
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  private globToRegExp(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${pattern}$`);
  }
}
