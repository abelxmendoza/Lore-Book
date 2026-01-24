import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../../src/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

describe('Route Registry', () => {
  let validateRouteRegistry: () => { valid: boolean; errors: string[] };
  let routeRegistry: { path: string; router: unknown }[];

  beforeAll(async () => {
    const mod = await import('../../src/routes/routeRegistry');
    validateRouteRegistry = mod.validateRouteRegistry;
    routeRegistry = mod.routeRegistry;
  });

  it('validateRouteRegistry returns valid and no errors when registry is well-formed', () => {
    const result = validateRouteRegistry();
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('routeRegistry has entries', () => {
    expect(routeRegistry.length).toBeGreaterThan(0);
  });

  it('each route entry has path and router', () => {
    for (const entry of routeRegistry) {
      expect(entry).toHaveProperty('path');
      expect(typeof entry.path).toBe('string');
      expect(entry.path.length).toBeGreaterThan(0);
      expect(entry).toHaveProperty('router');
      expect(entry.router).toBeDefined();
    }
  });

  it('no duplicate paths in routeRegistry', () => {
    const paths = routeRegistry.map((e) => e.path);
    const seen = new Set<string>();
    for (const p of paths) {
      expect(seen.has(p)).toBe(false);
      seen.add(p);
    }
  });
});
