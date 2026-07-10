import { describe, expect, it } from 'vitest';

import { getChatDiagnosticScenarios, runChatDiagnostics } from './runner';

describe('chat reliability diagnostics', () => {
  it('keeps the P0 scenario catalog declarative and non-destructive', () => {
    const scenarios = getChatDiagnosticScenarios();

    expect(scenarios.length).toBeGreaterThanOrEqual(12);
    expect(scenarios.every((scenario) => scenario.priority === 'P0')).toBe(true);
    expect(scenarios.every((scenario) => scenario.destructive === false)).toBe(true);
    expect(scenarios.find((scenario) => scenario.id === 'CHAT-004')?.name).toMatch(/Thread isolation/);
  });

  it('warns and skips live checks without a synthetic diagnostic user', async () => {
    const result = await runChatDiagnostics({
      runId: 'test-run',
      executeLive: false,
      env: {
        NODE_ENV: 'test',
        API_ENV: 'dev',
      },
    });

    expect(result.runId).toBe('test-run');
    expect(result.status).toBe('WARN');
    expect(result.syntheticUser.configured).toBe(false);
    expect(result.summary.SKIPPED).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes('LOREBOOK_DIAGNOSTIC_USER_ID'))).toBe(true);
  });

  it('passes contract checks when synthetic and dependency env are present', async () => {
    const result = await runChatDiagnostics({
      runId: 'test-run',
      executeLive: false,
      syntheticUserId: '00000000-0000-4000-8000-000000000001',
      env: {
        NODE_ENV: 'test',
        API_ENV: 'dev',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'present',
        OPENAI_API_KEY: 'present',
      },
    });

    expect(result.status).toBe('PASS');
    expect(result.summary.FAIL).toBe(0);
    expect(result.summary.SKIPPED).toBe(0);
  });
});
