import { describe, it, expect } from 'vitest';

import {
  findDeprecatedEnabled,
  findNonStandardSchemaExtensions,
  parseEnabledExtensions,
} from '../../src/services/postgresExtensions';

describe('postgresExtensions', () => {
  it('parses enabled extension inventory from RPC json', () => {
    expect(
      parseEnabledExtensions([
        { name: 'vector', schema: 'extensions', version: '0.8.0' },
        { name: 'pg_trgm', schema: 'public', version: '1.6' },
      ])
    ).toEqual([
      { name: 'vector', schema: 'extensions', version: '0.8.0' },
      { name: 'pg_trgm', schema: 'public', version: '1.6' },
    ]);
  });

  it('finds PG17-deprecated extensions', () => {
    expect(
      findDeprecatedEnabled([{ name: 'pgjwt', schema: 'extensions', version: '1.0' }])
    ).toEqual(['pgjwt']);
  });

  it('flags extensions outside the Supabase extensions schema', () => {
    const found = findNonStandardSchemaExtensions([
      { name: 'pg_trgm', schema: 'public', version: '1.6' },
      { name: 'vector', schema: 'extensions', version: '0.8.0' },
    ]);
    expect(found.map((e) => e.name)).toEqual(['pg_trgm']);
  });
});
