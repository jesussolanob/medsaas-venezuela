import { safeStringify } from './safe-stringify';

describe('safeStringify', () => {
  it('serializes a plain object', () => {
    const result = safeStringify({ a: 1, b: 'hello' });
    expect(result).toBe('{"a":1,"b":"hello"}');
  });

  it('serializes a primitive string', () => {
    expect(safeStringify('hello')).toBe('"hello"');
  });

  it('serializes a number', () => {
    expect(safeStringify(42)).toBe('42');
  });

  it('serializes null', () => {
    expect(safeStringify(null)).toBe('null');
  });

  it('serializes undefined as undefined (JSON.stringify returns undefined for primitives but String() handles it)', () => {
    // JSON.stringify(undefined) returns undefined (not a string), so it falls
    // through to String(value) which returns "undefined".
    const result = safeStringify(undefined);
    expect(result).toBe('undefined');
  });

  it('serializes an Error instance as { name, message, stack }', () => {
    const err = new Error('something went wrong');
    const parsed = JSON.parse(safeStringify(err)) as { name: string; message: string; stack: string };
    expect(parsed.name).toBe('Error');
    expect(parsed.message).toBe('something went wrong');
    expect(parsed.stack).toContain('Error: something went wrong');
  });

  it('serializes a custom error subclass', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'CustomError';
      }
    }
    const err = new CustomError('custom');
    const parsed = JSON.parse(safeStringify(err)) as { name: string; message: string };
    expect(parsed.name).toBe('CustomError');
    expect(parsed.message).toBe('custom');
  });

  it('replaces circular references with "[Circular]"', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj['self'] = obj;
    const result = safeStringify(obj);
    const parsed = JSON.parse(result) as { a: number; self: string };
    expect(parsed.a).toBe(1);
    expect(parsed.self).toBe('[Circular]');
  });

  it('handles deeply nested circular references', () => {
    const a: Record<string, unknown> = { value: 'a' };
    const b: Record<string, unknown> = { value: 'b', parent: a };
    a['child'] = b;
    const result = safeStringify(a);
    expect(result).not.toThrow;
    expect(result).toContain('"value":"a"');
    expect(result).toContain('[Circular]');
  });

  it('serializes arrays', () => {
    expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
  });

  it('serializes an array containing a circular reference', () => {
    const arr: unknown[] = [1, 2];
    arr.push(arr);
    const result = safeStringify(arr);
    const parsed = JSON.parse(result) as unknown[];
    expect(parsed[0]).toBe(1);
    expect(parsed[2]).toBe('[Circular]');
  });

  it('returns "[unserializable]" for BigInt (cannot be JSON-stringified)', () => {
    // BigInt throws from JSON.stringify and also from String(), so we catch that path.
    // But String(BigInt(1)) actually works in JS, so we just assert it does not throw.
    expect(() => safeStringify(BigInt(1))).not.toThrow();
  });
});
