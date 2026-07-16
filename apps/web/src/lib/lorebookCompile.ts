import { supabase } from './supabase';
import { addCsrfHeaders, acquireCsrfToken, getCsrfToken } from './security';
import { config } from '../config/env';
import type { LoreReadinessEvaluation } from './loreReadiness';

export type CompileConflict = {
  message: string;
  canForce: boolean;
  mode: string;
  evaluation: LoreReadinessEvaluation;
};

export type CompileResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; conflict: CompileConflict };

async function authHeaders(method: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (method !== 'GET' && token && !getCsrfToken()) {
    await acquireCsrfToken(token, config.api.url);
  }
  return addCsrfHeaders({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
}

async function postCompile<T>(path: string, body: Record<string, unknown>): Promise<CompileResult<T>> {
  const apiBaseUrl = config.api.url;
  const url = `${apiBaseUrl}${path}`;
  const headers = await authHeaders('POST');
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

  const payload = await res.json().catch(() => ({}));

  if (res.status === 409) {
    return {
      ok: false,
      conflict: {
        message: payload.message ?? payload.error ?? 'Not ready to compile',
        canForce: Boolean(payload.canForce),
        mode: payload.mode ?? 'hard_blocked',
        evaluation: payload.evaluation,
      },
    };
  }

  if (!res.ok) {
    throw new Error(payload.message ?? payload.error ?? `HTTP ${res.status}`);
  }

  return {
    ok: true,
    data: payload as T,
    warning: payload.readiness?.warning,
  };
}

export async function compileLorebookFromQuery(
  query: string,
  force = false
): Promise<CompileResult<{ biography: unknown; biographyId?: string; persisted?: boolean; parsedQuery?: unknown }>> {
  return postCompile('/api/biography/search', { query, force });
}

export async function compileLorebookFromSpec(
  spec: Record<string, unknown>,
  force = false
): Promise<CompileResult<{ biography: unknown; biographyId?: string; persisted?: boolean }>> {
  return postCompile('/api/biography/generate', { ...spec, force });
}

export type CompileTopicOptions = {
  force?: boolean;
  characterId?: string;
  locationId?: string;
  organizationId?: string;
  skillId?: string;
  threadId?: string;
  timeRange?: { start: string; end: string };
  themes?: string[];
};

/** Topic-scoped compile — never sends topic ids through NL /search. */
export async function compileLorebookFromTopic(
  topicId: string,
  options: CompileTopicOptions = {}
): Promise<CompileResult<{ biography: unknown; biographyId?: string; persisted?: boolean }>> {
  const body: Record<string, unknown> = {
    topicId,
    force: options.force ?? false,
  };
  if (options.characterId) body.characterId = options.characterId;
  if (options.locationId) body.locationId = options.locationId;
  if (options.organizationId) body.organizationId = options.organizationId;
  if (options.skillId) body.skillId = options.skillId;
  if (options.threadId) body.threadId = options.threadId;
  if (options.timeRange) body.timeRange = options.timeRange;
  if (options.themes?.length) body.themes = options.themes;
  return postCompile('/api/biography/generate', body);
}

export function shouldConfirmForceCompile(conflict: CompileConflict): boolean {
  return conflict.canForce && conflict.evaluation.progress >= 0.45;
}

export function formatCompileBlockMessage(conflict: CompileConflict): string {
  return conflict.evaluation.suggestions[0] ?? conflict.message;
}
