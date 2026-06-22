import { logger } from '../../logger';
import { loadUserCanonFacts } from './canonFactLoader';
import { responseCompilerService } from './responseCompilerService';
import type {
  CompiledAssistantResponse,
  ResponseCompileInput,
  SourceMessageWitness,
} from './responseCompilerTypes';

export type CompileAssistantResponseOpts = {
  userId: string;
  rawResponse: string;
  userMessage: string;
  userMessageId?: string;
  conversationHistory?: Array<{ role: string; content: string; id?: string }>;
  canonFacts?: ResponseCompileInput['canonFacts'];
};

function buildWitnesses(
  userMessage: string,
  userMessageId: string | undefined,
  history: CompileAssistantResponseOpts['conversationHistory'],
): SourceMessageWitness[] {
  const witnesses: SourceMessageWitness[] = [];

  for (const turn of history ?? []) {
    if (!turn.content?.trim()) continue;
    witnesses.push({
      id: turn.id ?? `hist-${witnesses.length}`,
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.content,
    });
  }

  witnesses.push({
    id: userMessageId ?? 'current-user',
    role: 'user',
    content: userMessage,
  });

  return witnesses.filter((w) => w.role === 'user');
}

/**
 * Compile assistant output into provenance-aware artifacts.
 * Non-blocking — safe to call fire-and-forget after streaming completes.
 */
export function compileAssistantResponse(opts: CompileAssistantResponseOpts): CompiledAssistantResponse {
  const compiled = responseCompilerService.compile({
    userId: opts.userId,
    rawResponse: opts.rawResponse,
    sourceMessages: buildWitnesses(opts.userMessage, opts.userMessageId, opts.conversationHistory),
    canonFacts: opts.canonFacts ?? [],
  });

  logger.debug(
    {
      userId: opts.userId,
      grounded: compiled.groundedClaims.length,
      inferred: compiled.inferredClaims.length,
      unsupported: compiled.unsupportedClaims.length,
      contradictions: compiled.contradictions.length,
      actions: compiled.actionCandidates.length,
      blocked: compiled.memoryCandidatesBlocked.length,
      certaintyScore: compiled.certaintyScore,
    },
    'Response compiler completed',
  );

  return compiled;
}

export function compileAssistantResponseAsync(opts: CompileAssistantResponseOpts): void {
  try {
    compileAssistantResponse(opts);
  } catch (err) {
    logger.warn({ err, userId: opts.userId }, 'Response compiler failed (non-blocking)');
  }
}

/**
 * Same as {@link compileAssistantResponse}, but loads the user's real canon from
 * durable lore first so grounding (Phase 2) and contradiction (Phase 5) actually
 * fire against established facts. Caller-supplied `canonFacts` are merged on top.
 * Best-effort: a canon read failure degrades to source-message grounding only.
 */
export async function compileAssistantResponseWithCanon(
  opts: CompileAssistantResponseOpts,
): Promise<CompiledAssistantResponse> {
  let loadedCanon: ResponseCompileInput['canonFacts'] = [];
  if (opts.userId) {
    try {
      loadedCanon = await loadUserCanonFacts(opts.userId);
    } catch (err) {
      logger.warn({ err, userId: opts.userId }, 'Canon load failed — grounding without canon');
    }
  }

  const compiled = await responseCompilerService.compileWithSemantics({
    userId: opts.userId,
    rawResponse: opts.rawResponse,
    sourceMessages: buildWitnesses(opts.userMessage, opts.userMessageId, opts.conversationHistory),
    canonFacts: [...(loadedCanon ?? []), ...(opts.canonFacts ?? [])],
  });

  logger.debug(
    {
      userId: opts.userId,
      grounded: compiled.groundedClaims.length,
      inferred: compiled.inferredClaims.length,
      unsupported: compiled.unsupportedClaims.length,
      contradictions: compiled.contradictions.length,
      certaintyScore: compiled.certaintyScore,
    },
    'Response compiler (canon + semantic) completed',
  );

  return compiled;
}
