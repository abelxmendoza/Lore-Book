import { describe, it, expect } from 'vitest';

import {
  classifyPostgresError,
  extractPostgresErrorFields,
  isPostgresDiskFull,
  isPostgresReadOnly,
  isTransientPostgresError,
  postgresErrorCode,
  StorageBlockedError,
  throwIfStorageBlocked,
} from '../../src/utils/postgresError';

describe('extractPostgresErrorFields', () => {
  it('reads code and message from Error objects', () => {
    const err = Object.assign(new Error('cannot execute INSERT in a read-only transaction'), {
      code: '25006',
    });
    expect(extractPostgresErrorFields(err)).toEqual({
      code: '25006',
      message: 'cannot execute INSERT in a read-only transaction',
    });
  });

  it('reads PostgREST-shaped objects', () => {
    expect(
      extractPostgresErrorFields({ code: 'PGRST205', message: 'relation missing from schema cache' })
    ).toEqual({
      code: 'PGRST205',
      message: 'relation missing from schema cache',
    });
  });
});

describe('classifyPostgresError', () => {
  it('classifies read-only mode (Supabase quota)', () => {
    const classified = classifyPostgresError({
      code: '25006',
      message: 'cannot execute INSERT in a read-only transaction',
    });
    expect(classified.kind).toBe('read_only');
    expect(classified.httpStatus).toBe(507);
    expect(classified.retryable).toBe(false);
    expect(postgresErrorCode(classified.kind)).toBe('DB_READ_ONLY');
  });

  it('classifies disk full by SQLSTATE', () => {
    const classified = classifyPostgresError({ code: '53100', message: 'could not extend file' });
    expect(classified.kind).toBe('disk_full');
    expect(isPostgresDiskFull(classified)).toBe(true);
  });

  it('classifies transient connection errors', () => {
    const classified = classifyPostgresError({ message: 'connection reset by peer' });
    expect(classified.kind).toBe('transient');
    expect(isTransientPostgresError(classified)).toBe(true);
    expect(classified.httpStatus).toBe(503);
  });

  it('classifies schema cache misses', () => {
    const classified = classifyPostgresError({ code: 'PGRST205', message: 'schema cache' });
    expect(classified.kind).toBe('schema');
  });
});

describe('StorageBlockedError', () => {
  it('throws for read-only failures', () => {
    expect(() =>
      throwIfStorageBlocked({ code: '25006', message: 'read-only transaction' })
    ).toThrow(StorageBlockedError);
    expect(isPostgresReadOnly({ code: '25006', message: 'read-only transaction' })).toBe(true);
  });

  it('does not throw for transient errors', () => {
    const classified = throwIfStorageBlocked({ message: 'connection timeout' });
    expect(classified.kind).toBe('transient');
  });
});
