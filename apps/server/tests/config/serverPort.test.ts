import { describe, it, expect } from 'vitest';

import {
  resolveServerPort,
  resolveBindHost,
  DEFAULT_PORT,
  RAILWAY_DEFAULT_PORT,
} from '../../src/config/serverPort';

describe('resolveServerPort', () => {
  it('falls back to the default port when PORT is unset', () => {
    const result = resolveServerPort({});
    expect(result.port).toBe(DEFAULT_PORT);
    expect(result.source).toBe('default');
    expect(result.warnings).toHaveLength(0);
  });

  it('falls back to the default port when PORT is empty/whitespace', () => {
    expect(resolveServerPort({ PORT: '' }).port).toBe(DEFAULT_PORT);
    expect(resolveServerPort({ PORT: '   ' }).port).toBe(DEFAULT_PORT);
    expect(resolveServerPort({ PORT: '   ' }).source).toBe('default');
  });

  it('parses a valid numeric PORT', () => {
    const result = resolveServerPort({ PORT: '8080' });
    expect(result.port).toBe(8080);
    expect(result.source).toBe('PORT');
    expect(result.rawValue).toBe('8080');
    expect(result.warnings).toHaveLength(0);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(resolveServerPort({ PORT: ' 3000 ' }).port).toBe(3000);
  });

  it('rejects non-numeric PORT and warns', () => {
    const result = resolveServerPort({ PORT: 'not-a-number' });
    expect(result.port).toBe(DEFAULT_PORT);
    expect(result.source).toBe('default');
    expect(result.warnings.join(' ')).toMatch(/not a valid integer/i);
  });

  it('rejects non-integer PORT (floats) and warns', () => {
    const result = resolveServerPort({ PORT: '80.5' });
    expect(result.port).toBe(DEFAULT_PORT);
    expect(result.warnings.join(' ')).toMatch(/not a valid integer/i);
  });

  it('rejects out-of-range ports and warns', () => {
    expect(resolveServerPort({ PORT: '0' }).port).toBe(DEFAULT_PORT);
    expect(resolveServerPort({ PORT: '70000' }).port).toBe(DEFAULT_PORT);
    expect(resolveServerPort({ PORT: '-1' }).port).toBe(DEFAULT_PORT);
    expect(resolveServerPort({ PORT: '70000' }).warnings.join(' ')).toMatch(
      /outside the valid range/i
    );
  });

  it('accepts the boundary ports 1 and 65535', () => {
    expect(resolveServerPort({ PORT: '1' }).port).toBe(1);
    expect(resolveServerPort({ PORT: '65535' }).port).toBe(65535);
  });

  // Regression guard for the 2026-06-18 outage: PORT mismatched the Railway
  // domain target port (8080), producing 502s. We can't read the dashboard
  // target port from inside the process, but we CAN warn when a hosted Railway
  // deploy uses a non-default port.
  it('warns when on Railway with a non-default port', () => {
    const result = resolveServerPort({
      PORT: '4000',
      RAILWAY_ENVIRONMENT: 'production',
    });
    expect(result.port).toBe(4000);
    expect(result.warnings.join(' ')).toMatch(/Railway/);
    expect(result.warnings.join(' ')).toContain(String(RAILWAY_DEFAULT_PORT));
  });

  it('does NOT warn when on Railway with the conventional 8080 port', () => {
    const result = resolveServerPort({
      PORT: '8080',
      RAILWAY_ENVIRONMENT: 'production',
    });
    expect(result.port).toBe(8080);
    expect(result.warnings).toHaveLength(0);
  });

  it('does NOT emit the Railway warning off-platform', () => {
    const result = resolveServerPort({ PORT: '4000' });
    expect(result.warnings).toHaveLength(0);
  });

  it('never throws on hostile input', () => {
    expect(() => resolveServerPort({ PORT: '{}' })).not.toThrow();
    expect(() => resolveServerPort({ PORT: 'NaN' })).not.toThrow();
    expect(() => resolveServerPort({ PORT: 'Infinity' })).not.toThrow();
    expect(resolveServerPort({ PORT: 'Infinity' }).port).toBe(DEFAULT_PORT);
  });
});

describe('resolveBindHost', () => {
  it('defaults to 0.0.0.0 so the platform edge/healthcheck can reach the process', () => {
    expect(resolveBindHost({})).toBe('0.0.0.0');
  });

  it('honors an explicit HOST override', () => {
    expect(resolveBindHost({ HOST: '127.0.0.1' })).toBe('127.0.0.1');
  });

  it('ignores empty/whitespace HOST', () => {
    expect(resolveBindHost({ HOST: '' })).toBe('0.0.0.0');
    expect(resolveBindHost({ HOST: '   ' })).toBe('0.0.0.0');
  });
});
