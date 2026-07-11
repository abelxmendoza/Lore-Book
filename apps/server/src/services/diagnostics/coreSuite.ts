/**
 * Core System Health suite — must-pass checks for LoreBook chat + recall + self-model.
 */

import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';

import { config } from '../../config';
import { detectSyncRecallIntent, matchesFoundationRecallQuery } from '../chat/recallIntentPatterns';
import { detectMetaQuery, resolveMetaProductContext } from '../chat/lorebookSelfModelService';
import { runChatDiagnostics } from './chatReliability/runner';
import {
  setCoreSuiteSnapshot,
  type CoreSuiteSnapshot,
  type CoreSuiteStatus,
} from './coreSuiteSnapshot';

export type CoreCheckResult = {
  id: string;
  name: string;
  suite: 'boot' | 'durability' | 'recall' | 'self_model';
  status: CoreSuiteStatus;
  durationMs: number;
  expected: string;
  actual: string;
  fixHint?: string;
};

export type CoreSuiteResult = {
  runId: string;
  status: CoreSuiteStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: Record<CoreSuiteStatus, number>;
  checks: CoreCheckResult[];
  suites: Array<{
    id: string;
    name: string;
    status: CoreSuiteStatus;
    passCount: number;
    failCount: number;
    warnCount: number;
    skippedCount: number;
    detail?: string;
  }>;
  chatDiagnostics?: {
    status: CoreSuiteStatus;
    scenarioCount: number;
    durationMs: number;
  };
};

const terminalRank: Record<CoreSuiteStatus, number> = {
  FAIL: 4,
  WARN: 3,
  SKIPPED: 2,
  PASS: 1,
};

function worst(statuses: CoreSuiteStatus[]): CoreSuiteStatus {
  return statuses.reduce<CoreSuiteStatus>(
    (w, s) => (terminalRank[s] > terminalRank[w] ? s : w),
    'PASS'
  );
}

function emptySummary(): Record<CoreSuiteStatus, number> {
  return { PASS: 0, WARN: 0, FAIL: 0, SKIPPED: 0 };
}

async function checkBoot(): Promise<CoreCheckResult[]> {
  const started = performance.now();
  const checks: CoreCheckResult[] = [];

  const hasUrl = Boolean(config.supabaseUrl);
  checks.push({
    id: 'boot-supabase',
    name: 'Supabase configured',
    suite: 'boot',
    status: hasUrl ? 'PASS' : 'FAIL',
    durationMs: Math.round(performance.now() - started),
    expected: 'SUPABASE_URL present',
    actual: hasUrl ? 'Configured' : 'Missing SUPABASE_URL',
    fixHint: hasUrl ? undefined : 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the server env.',
  });

  const hasOpenAi = Boolean(config.openAiKey);
  checks.push({
    id: 'boot-openai',
    name: 'OpenAI key configured',
    suite: 'boot',
    status: hasOpenAi ? 'PASS' : 'WARN',
    durationMs: Math.round(performance.now() - started),
    expected: 'OPENAI_API_KEY present for live chat',
    actual: hasOpenAi ? 'Configured' : 'Missing OPENAI_API_KEY',
    fixHint: hasOpenAi ? undefined : 'Set OPENAI_API_KEY for full chat replies.',
  });

  return checks;
}

async function checkSelfModel(): Promise<CoreCheckResult[]> {
  const cases: Array<{ id: string; query: string; mustInclude: RegExp; concepts?: string[] }> = [
    {
      id: 'self-what-is',
      query: 'What is LoreBook?',
      mustInclude: /LoreBook|memory|story/i,
    },
    {
      id: 'self-creator',
      query: 'Who created LoreBook?',
      mustInclude: /Abel Mendoza/i,
    },
    {
      id: 'self-capabilities',
      query: 'What can you do?',
      mustInclude: /character|recall|story|memory/i,
    },
    {
      id: 'self-priority',
      query: 'What is your focus?',
      mustInclude: /story|lore|you|protagonist|priority/i,
    },
    {
      id: 'self-status',
      query: 'Are you working?',
      mustInclude: /status|online|health|ready|working|LoreBook/i,
    },
  ];

  const results: CoreCheckResult[] = [];

  for (const tc of cases) {
    const started = performance.now();
    const match = detectMetaQuery(tc.query);
    const resolved = await resolveMetaProductContext(tc.query);
    const content = resolved.shortCircuit?.content ?? '';
    const ok =
      match?.strength === 'strong' &&
      Boolean(resolved.shortCircuit) &&
      tc.mustInclude.test(content);

    results.push({
      id: tc.id,
      name: `Self-model: ${tc.query}`,
      suite: 'self_model',
      status: ok ? 'PASS' : 'FAIL',
      durationMs: Math.round(performance.now() - started),
      expected: `Strong meta short-circuit matching ${tc.mustInclude}`,
      actual: ok
        ? `Matched concepts: ${(match?.concepts ?? []).join(', ')}`
        : `match=${match?.strength ?? 'none'}; content=${content.slice(0, 120) || '(empty)'}`,
      fixHint: ok
        ? undefined
        : 'Check lorebookSelfModelService META_QUERY_RULES and FALLBACK_SELF_MODEL.',
    });
  }

  // User-lore queries must NOT be swallowed by product self-model
  const started = performance.now();
  const familyMeta = detectMetaQuery('Tell me about my family');
  const rosterMeta = detectMetaQuery('Who are the characters in my story?');
  const focusOk = familyMeta === null && rosterMeta === null;
  results.push({
    id: 'self-focus-user-first',
    name: 'User-lore queries are not product meta',
    suite: 'self_model',
    status: focusOk ? 'PASS' : 'FAIL',
    durationMs: Math.round(performance.now() - started),
    expected: 'Family/roster queries skip self-model gate',
    actual: focusOk
      ? 'Family and roster correctly excluded'
      : `family=${familyMeta?.strength ?? 'null'}, roster=${rosterMeta?.strength ?? 'null'}`,
    fixHint: focusOk ? undefined : 'USER_RECALL_BLOCKERS must keep user recall out of product meta.',
  });

  return results;
}

async function checkRecallRouting(userId?: string | null): Promise<CoreCheckResult[]> {
  const routingCases = [
    { query: 'Who are the characters in my story?', intent: 'character_roster' as const },
    { query: 'Tell me about my family', intent: 'family' as const },
    { query: 'What else did I say in this conversation?', intent: 'conversation' as const },
    { query: 'Who is Ashley De La Cruz?', intent: 'entity' as const },
  ];

  const results: CoreCheckResult[] = [];

  for (const tc of routingCases) {
    const started = performance.now();
    const foundation = matchesFoundationRecallQuery(tc.query);
    const sync = detectSyncRecallIntent(tc.query);
    const intentOk =
      sync === tc.intent ||
      (tc.intent === 'entity' && (sync === 'entity' || foundation)) ||
      (tc.intent === 'conversation' && sync === 'conversation');

    results.push({
      id: `recall-route-${tc.intent}`,
      name: `Recall routing: ${tc.query}`,
      suite: 'recall',
      status: foundation && intentOk ? 'PASS' : 'FAIL',
      durationMs: Math.round(performance.now() - started),
      expected: `Foundation primary → ${tc.intent}`,
      actual: `foundation=${foundation}, syncIntent=${sync ?? 'null'}`,
      fixHint:
        foundation && intentOk
          ? undefined
          : 'Check recallIntentPatterns and isFoundationPrimaryIntent wiring.',
    });
  }

  if (userId) {
    const started = performance.now();
    try {
      const { routeRecallQuery } = await import('../chat/recallQueryRouter');
      const result = await routeRecallQuery(userId, 'Who are the characters in my story?');
      const ok =
        result.intent === 'character_roster' &&
        result.foundationPrimary &&
        !result.contextBlock.includes('Relevant past entries were found');
      results.push({
        id: 'recall-live-roster',
        name: 'Live foundation roster recall',
        suite: 'recall',
        status: ok ? 'PASS' : 'WARN',
        durationMs: Math.round(performance.now() - started),
        expected: 'character_roster foundationPrimary without Archivist snippets',
        actual: `intent=${result.intent}, primary=${result.foundationPrimary}, preview=${result.contextBlock.slice(0, 100)}`,
        fixHint: ok ? undefined : 'Run validateRecall against this user; check characters table coverage.',
      });
    } catch (err) {
      results.push({
        id: 'recall-live-roster',
        name: 'Live foundation roster recall',
        suite: 'recall',
        status: 'WARN',
        durationMs: Math.round(performance.now() - started),
        expected: 'Live routeRecallQuery succeeds',
        actual: err instanceof Error ? err.message : 'Live recall failed',
        fixHint: 'Ensure DB is reachable for live recall validation.',
      });
    }
  } else {
    results.push({
      id: 'recall-live-roster',
      name: 'Live foundation roster recall',
      suite: 'recall',
      status: 'SKIPPED',
      durationMs: 0,
      expected: 'Optional live user recall',
      actual: 'Skipped — no recall test user configured',
      fixHint: 'Set RECALL_TEST_USER_ID or LOREBOOK_DIAGNOSTIC_USER_ID for live recall.',
    });
  }

  return results;
}

export type RunCoreSuiteOptions = {
  includeChatLive?: boolean;
  recallUserId?: string | null;
};

export async function runCoreSuite(options: RunCoreSuiteOptions = {}): Promise<CoreSuiteResult> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  const boot = await checkBoot();
  const selfModel = await checkSelfModel();
  const recallUser =
    options.recallUserId ??
    process.env.RECALL_TEST_USER_ID ??
    process.env.LOREBOOK_DIAGNOSTIC_USER_ID ??
    null;
  const recall = await checkRecallRouting(recallUser);

  let chatDiagnostics: CoreSuiteResult['chatDiagnostics'];
  const durabilityChecks: CoreCheckResult[] = [];

  try {
    const chatRun = await runChatDiagnostics({
      includeSkipped: true,
      executeLive: options.includeChatLive === true,
      runId,
    });
    chatDiagnostics = {
      status: chatRun.status,
      scenarioCount: chatRun.scenarios.length,
      durationMs: chatRun.durationMs,
    };
    durabilityChecks.push({
      id: 'durability-chat-suite',
      name: options.includeChatLive
        ? 'Chat reliability live probes'
        : 'Chat reliability contract catalog',
      suite: 'durability',
      status: chatRun.status,
      durationMs: chatRun.durationMs,
      expected: 'Chat durability scenarios PASS (or SKIPPED if no synthetic user)',
      actual: `${chatRun.summary.PASS} pass / ${chatRun.summary.FAIL} fail / ${chatRun.summary.SKIPPED} skipped / ${chatRun.summary.WARN} warn`,
      fixHint:
        chatRun.status === 'FAIL'
          ? 'Open the Chat Durability tab and expand failed scenarios.'
          : undefined,
    });
  } catch (err) {
    durabilityChecks.push({
      id: 'durability-chat-suite',
      name: 'Chat reliability suite',
      suite: 'durability',
      status: 'FAIL',
      durationMs: 0,
      expected: 'Chat diagnostics runner completes',
      actual: err instanceof Error ? err.message : 'Runner failed',
      fixHint: 'Check /api/diagnostics/chat and LOREBOOK_DIAGNOSTIC_USER_ID.',
    });
  }

  const checks = [...boot, ...durabilityChecks, ...recall, ...selfModel];
  const summary = emptySummary();
  for (const c of checks) summary[c.status] += 1;

  const suiteIds = ['boot', 'durability', 'recall', 'self_model'] as const;
  const suiteNames: Record<(typeof suiteIds)[number], string> = {
    boot: 'Boot & config',
    durability: 'Chat durability',
    recall: 'Foundation recall',
    self_model: 'LoreBook self-knowledge',
  };

  const suites = suiteIds.map((id) => {
    const subset = checks.filter((c) => c.suite === id);
    const statuses = subset.map((c) => c.status);
    return {
      id,
      name: suiteNames[id],
      status: subset.length ? worst(statuses) : ('SKIPPED' as CoreSuiteStatus),
      passCount: subset.filter((c) => c.status === 'PASS').length,
      failCount: subset.filter((c) => c.status === 'FAIL').length,
      warnCount: subset.filter((c) => c.status === 'WARN').length,
      skippedCount: subset.filter((c) => c.status === 'SKIPPED').length,
      detail: subset
        .filter((c) => c.status === 'FAIL' || c.status === 'WARN')
        .map((c) => c.name)
        .slice(0, 3)
        .join('; '),
    };
  });

  const completedAt = new Date().toISOString();
  const result: CoreSuiteResult = {
    runId,
    status: worst(checks.map((c) => c.status)),
    startedAt,
    completedAt,
    durationMs: Math.round(performance.now() - t0),
    summary,
    checks,
    suites,
    chatDiagnostics,
  };

  const snapshot: CoreSuiteSnapshot = {
    runId,
    status: result.status,
    completedAt,
    durationMs: result.durationMs,
    summary,
    startedAt,
    suites: suites.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      detail: s.detail,
    })),
    checks: result.checks,
  };
  setCoreSuiteSnapshot(snapshot);

  return result;
}
