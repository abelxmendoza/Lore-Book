import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../../src/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

describe('Route Registry', () => {
  let validateRouteRegistry: () => { valid: boolean; errors: string[] };
  let routeRegistry: { path: string; router: unknown }[];

  beforeAll(async () => {
    // routeRegistry imports 50+ route modules; give it extra time when the full
    // test suite runs and all workers compete for the module-transform cache.
    const mod = await import('../../src/routes/routeRegistry');
    validateRouteRegistry = mod.validateRouteRegistry;
    routeRegistry = mod.routeRegistry;
  }, 120_000);

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

  it('registers production-critical groups and admin routes as CORE_RUNTIME', () => {
    const corePaths = routeRegistry
      .filter((entry) => entry.classification === 'CORE_RUNTIME')
      .map((entry) => entry.path);
    expect(corePaths).toContain('/api/organizations');
    expect(corePaths).toContain('/api/group-candidates');
    expect(corePaths).toContain('/api/family-trees');
    expect(corePaths).toContain('/api/admin');
    expect(corePaths).toContain('/api/skills');
  });

  it('registers P0-promoted experimental systems as CORE_RUNTIME', () => {
    const corePaths = routeRegistry
      .filter((entry) => entry.classification === 'CORE_RUNTIME')
      .map((entry) => entry.path);
    const promoted = [
      '/api/biography',
      '/api/entity-resolution',
      '/api/goals',
      '/api/life-arcs',
      '/api/life-arc',
      '/api/voids',
      '/api/insights',
      '/api/predictions',
      '/api/timeline-hierarchy',
      '/api/documents',
      '/api/photos',
      '/api/entity-ambiguity',
      '/api/analytics',
      '/api/mrq',
      '/api/habits',
      '/api/values',
      '/api/decisions',
      '/api/essence',
      '/api/reactions',
      '/api/perception-reaction-engine',
      '/api/achievements',
    ];
    for (const path of promoted) {
      expect(corePaths, `${path} should be CORE_RUNTIME`).toContain(path);
    }
  });

  it('registers Trust Center and canonical API namespaces as CORE_RUNTIME', () => {
    const corePaths = routeRegistry
      .filter((entry) => entry.classification === 'CORE_RUNTIME')
      .map((entry) => entry.path);
    const canonical = [
      '/api/trust',
      '/api/books',
      '/api/knowledge',
      '/api/quests',
    ];
    for (const path of canonical) {
      expect(corePaths, `${path} should be CORE_RUNTIME`).toContain(path);
    }
  });

  it('photos and documents use protected mounts (not public)', () => {
    const photos = routeRegistry.find((e) => e.path === '/api/photos');
    const documents = routeRegistry.find((e) => e.path === '/api/documents');
    expect(photos?.requiresAuth).not.toBe(false);
    expect(documents?.requiresAuth).not.toBe(false);
  });
});
