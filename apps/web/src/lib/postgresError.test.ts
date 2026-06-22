import { describe, it, expect } from 'vitest';

import { extractApiErrorCode, friendlyPostgresErrorMessage } from '../../src/lib/postgresError';

describe('postgresError (web)', () => {
  it('maps API codes to user-facing storage messages', () => {
    expect(friendlyPostgresErrorMessage({ code: 'DB_READ_ONLY' })).toMatch(/read-only/i);
    expect(friendlyPostgresErrorMessage({ code: 'DB_STORAGE_FULL' })).toMatch(/storage is full/i);
  });

  it('detects storage failures from raw error strings', () => {
    expect(extractApiErrorCode('cannot execute INSERT in a read-only transaction')).toBe(
      'DB_READ_ONLY'
    );
  });

  it('returns null for unrelated errors', () => {
    expect(friendlyPostgresErrorMessage('network error')).toBeNull();
  });
});
