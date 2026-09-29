import { describe, expect, it } from 'vitest';
import { createIdempotencyKey } from './ids';

describe('createIdempotencyKey', () => {
  it('uses native randomUUID when the browser exposes it', () => {
    const source = { randomUUID: () => 'native-id', getRandomValues: <T extends ArrayBufferView>(value: T) => value };
    expect(createIdempotencyKey(source)).toBe('native-id');
  });

  it('creates a valid UUID with getRandomValues on an insecure LAN page', () => {
    const source = {
      getRandomValues: <T extends ArrayBufferView>(value: T) => {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        bytes.forEach((_, index) => { bytes[index] = index; });
        return value;
      },
    };
    expect(createIdempotencyKey(source)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
