import type { LoreAgentTrace } from '../../../api/loreAgents';
import type { ChatFocus } from '../../../types/chatFocus';
import type { CertifiedEntityMatch } from '../../../lib/certifiedEntityMatch';
import type { Message } from '../message/ChatMessage';
import type { RuntimeEvent } from '../services/runtimeDiagnostics';

export type ChatMessageDiagnosticSnapshot = {
  durability?: unknown;
  trace?: LoreAgentTrace;
  errors?: string[];
};

/** Compact chip / context snapshot for copy-conversation debugging. */
export type ComposerChipDebugSpan = {
  text: string;
  type: string;
  subtype?: string;
  start?: number;
  end?: number;
  entityStatus?: string;
  matchedEntityId?: string;
  matchedEntityName?: string;
  confidence?: number;
};

export type ComposerChipDebugEntity = {
  id: string;
  name: string;
  type: string;
  status?: string;
  matchKind?: string;
  composerChipKind?: string;
  matchedLabel?: string;
  included?: boolean;
  confirming?: boolean;
};

export type ComposerAndContextDebugSnapshot = {
  focusChip?: {
    entityId: string;
    entityName: string;
    entityType: string;
    sourceSurface: string;
    sourceLabel: string;
    relationshipId?: string;
    relationshipName?: string;
    knowledgeScope?: string;
    initialPrompt?: string;
  } | null;
  composerDraft?: string;
  composerEntityChips?: ComposerChipDebugEntity[];
  lexicalPreviewChips?: ComposerChipDebugSpan[];
  threadChips?: Array<{ id: string; name: string; type?: string }>;
  selectedThreadChipId?: string | null;
  /** Context that would ride with the next sendMessage. */
  contextUsed?: {
    entityContext?: { type: string; id: string } | null;
    composerEntitiesFromFocus?: ComposerChipDebugEntity[];
    chatFocusPresent?: boolean;
  };
};

/** People / Places / Actors / Building-on / Recent mentions for Copy all. */
export type ThreadSurfaceDebugSnapshot = {
  summaryLine?: string | null;
  people?: string[];
  places?: string[];
  themes?: string[];
  actors?: Array<{
    name: string;
    kind?: string;
    role?: string;
    status?: string;
    mentions?: number;
    entityId?: string | null;
    actorType?: string;
  }>;
  buildingOn?: Array<{ id: string; name: string; type?: string }>;
  recentMentions?: Array<{
    id: string;
    name: string;
    lifecycleStatus?: string;
    identityStage?: string;
    identityConfidence?: number;
  }>;
};

export type AdminChatDiagnosticContext = {
  threadId?: string | null;
  generatedAt?: string;
  runtimeEvents?: RuntimeEvent[];
  byMessageId?: Record<string, ChatMessageDiagnosticSnapshot>;
  composerAndContext?: ComposerAndContextDebugSnapshot;
  threadSurface?: ThreadSurfaceDebugSnapshot;
};

const SENSITIVE_KEY =
  /authorization|cookie|password|secret|api.?key|access.?token|refresh.?token|service.?role|system.?prompt|developer.?prompt/i;
const MAX_STRING_LENGTH = 4_000;
const MAX_ARRAY_LENGTH = 100;
const MAX_DEPTH = 12;

function redactSensitiveString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted API key]')
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^@\s]+@/gi, (match) => {
      const schemeEnd = match.indexOf('://') + 3;
      return `${match.slice(0, schemeEnd)}[redacted]@`;
    });
}

function redactDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated: depth limit]';
  if (typeof value === 'string') {
    const redacted = redactSensitiveString(value);
    return redacted.length > MAX_STRING_LENGTH
      ? `${redacted.slice(0, MAX_STRING_LENGTH)}… [truncated ${redacted.length - MAX_STRING_LENGTH} chars]`
      : redacted;
  }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => redactDiagnosticValue(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`[truncated ${value.length - MAX_ARRAY_LENGTH} items]`);
    }
    return items;
  }
  if (typeof value !== 'object') return String(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redactDiagnosticValue(item, depth + 1),
    ]),
  );
}

function messageRecord(message: Message) {
  const metadata = message.metadata ?? {};
  const timestamp = message.timestamp.getTime();
  return {
    id: message.id,
    ref: message.ref ?? null,
    role: message.role,
    timestamp: Number.isFinite(timestamp) ? message.timestamp.toISOString() : null,
    persistence: {
      persistStatus: message.persistStatus ?? null,
      lifecycle: message.lifecycle ?? null,
    },
    interpretation: {
      intent: metadata.intent ?? null,
      expressionMode: metadata.expression_mode ?? null,
      responseMode: message.response_mode ?? metadata.response_mode ?? null,
      activePersona: message.activePersona ?? null,
      modeDecision: message.modeDecision ?? null,
      ragStats: message.ragStats ?? null,
      continuityAcknowledged: message.continuityAcknowledged ?? null,
      continuityCallback: message.continuityCallback ?? null,
    },
    records: {
      mentionedEntities: message.mentionedEntities ?? [],
      creationOutcomeSummary: message.creationOutcomeSummary ?? null,
      creationOutcomes: message.creationOutcomes ?? [],
      relationshipPersistence: metadata.relationship_persistence ?? null,
      lexicalSignals: metadata.lexical_signals ?? null,
      ambiguities: message.ambiguities ?? [],
      disambiguationPrompt: message.disambiguation_prompt ?? null,
      timelineUpdates: message.timelineUpdates ?? [],
      staleProjectionSummary: message.staleProjectionSummary ?? null,
      staleProjectionHints: message.staleProjectionHints ?? [],
    },
    recall: {
      sources: message.sources ?? [],
      citations: message.citations ?? [],
      recallSources: message.recall_sources ?? [],
      confidenceLabel: message.confidence_label ?? null,
      disclaimer: message.disclaimer ?? null,
    },
  };
}

function projectTrace(trace: LoreAgentTrace | undefined) {
  if (!trace) return null;
  return {
    enabled: trace.enabled,
    pipeline: trace.pipeline,
    runs: trace.runs.map((run) => ({
      agent: run.agent_name,
      runId: run.run_id,
      status: run.status ?? null,
      confidence: run.confidence ?? null,
      durationMs: run.duration_ms ?? null,
      warnings: run.warnings ?? [],
    })),
    observations: trace.observations,
    proposedActions: trace.proposedActions.map((action) => ({
      agent: action.agent_name,
      action: action.action_type,
      status: action.status ?? null,
      confidence: action.confidence ?? null,
      requiresConfirmation: action.requires_confirmation ?? null,
      routedTo: action.routed_to ?? null,
      // Payloads can contain internal prompts or provider data. The persisted
      // action and route are enough to debug what LoreBook intended to do.
    })),
  };
}

function formatChipEntityLine(chip: ComposerChipDebugEntity): string {
  const flags = [
    chip.status,
    chip.matchKind,
    chip.composerChipKind,
    chip.included === false ? 'excluded' : chip.included ? 'included' : null,
    chip.confirming ? 'confirming' : null,
  ].filter(Boolean);
  return `- ${chip.name} (${chip.type}${flags.length ? `; ${flags.join(', ')}` : ''}) [${chip.id}]`;
}

function formatPreviewChipLine(span: ComposerChipDebugSpan): string {
  const bits = [
    span.type,
    span.subtype,
    span.entityStatus,
    span.matchedEntityName ? `→ ${span.matchedEntityName}` : null,
    span.confidence != null ? `conf=${span.confidence}` : null,
  ].filter(Boolean);
  const range =
    span.start != null && span.end != null ? ` @${span.start}-${span.end}` : '';
  return `- "${span.text}"${range} (${bits.join(', ')})`;
}

export function formatComposerAndContextDebugSection(
  snapshot: ComposerAndContextDebugSnapshot,
): string {
  const lines: string[] = ['===== COMPOSER & CONTEXT DEBUG ====='];

  const focus = snapshot.focusChip;
  if (focus) {
    lines.push(
      `Focus chip: ${focus.entityName} · ${focus.sourceLabel} (${focus.sourceSurface}/${focus.entityType})`,
    );
    if (focus.relationshipId) {
      lines.push(
        `  relationship: ${focus.relationshipName ?? focus.entityName} [${focus.relationshipId}]`,
      );
    }
    if (focus.knowledgeScope) lines.push(`  knowledgeScope: ${focus.knowledgeScope}`);
    if (focus.initialPrompt) lines.push(`  initialPrompt: ${focus.initialPrompt}`);
  } else {
    lines.push('Focus chip: (none)');
  }

  const draft = snapshot.composerDraft?.trim() ?? '';
  lines.push(draft ? `Composer draft: ${draft}` : 'Composer draft: (empty)');

  const entityChips = snapshot.composerEntityChips ?? [];
  lines.push(`Composer entity chips (${entityChips.length}):`);
  if (entityChips.length === 0) lines.push('  (none)');
  else lines.push(...entityChips.map(formatChipEntityLine));

  const previewChips = snapshot.lexicalPreviewChips ?? [];
  lines.push(`Lexical preview chips (${previewChips.length}):`);
  if (previewChips.length === 0) lines.push('  (none)');
  else lines.push(...previewChips.map(formatPreviewChipLine));

  const threadChips = snapshot.threadChips ?? [];
  lines.push(`Thread chips (${threadChips.length}):`);
  if (threadChips.length === 0) lines.push('  (none)');
  else {
    for (const chip of threadChips) {
      const selected =
        snapshot.selectedThreadChipId && snapshot.selectedThreadChipId === chip.id
          ? ' · selected'
          : '';
      lines.push(`- ${chip.name} (${chip.type ?? 'entity'})${selected} [${chip.id}]`);
    }
  }

  const ctx = snapshot.contextUsed;
  if (ctx) {
    lines.push('Context used for next send:');
    lines.push(
      `  entityContext: ${
        ctx.entityContext
          ? `${ctx.entityContext.type} [${ctx.entityContext.id}]`
          : '(none)'
      }`,
    );
    lines.push(`  chatFocusPresent: ${ctx.chatFocusPresent ? 'yes' : 'no'}`);
    const fromFocus = ctx.composerEntitiesFromFocus ?? [];
    lines.push(`  composerEntities from focus (${fromFocus.length}):`);
    if (fromFocus.length === 0) lines.push('    (none)');
    else lines.push(...fromFocus.map((chip) => `  ${formatChipEntityLine(chip)}`));
  }

  return lines.join('\n');
}

export function formatThreadSurfaceDebugSection(
  snapshot: ThreadSurfaceDebugSnapshot,
): string {
  const lines: string[] = ['===== THREAD SURFACE DEBUG ====='];

  const summary = snapshot.summaryLine?.trim();
  lines.push(summary ? `Summary: ${summary}` : 'Summary: (none)');

  const people = snapshot.people ?? [];
  lines.push(`People (${people.length}): ${people.length ? people.join(', ') : '(none)'}`);

  const places = snapshot.places ?? [];
  lines.push(`Places (${places.length}): ${places.length ? places.join(', ') : '(none)'}`);

  const themes = snapshot.themes ?? [];
  lines.push(`Themes (${themes.length}): ${themes.length ? themes.join(', ') : '(none)'}`);

  const actors = snapshot.actors ?? [];
  lines.push(`Actors (${actors.length}):`);
  if (actors.length === 0) lines.push('  (none)');
  else {
    for (const actor of actors) {
      const bits = [
        actor.kind,
        actor.actorType,
        actor.role,
        actor.status,
        actor.mentions != null ? `${actor.mentions} mentions` : null,
      ].filter(Boolean);
      const id = actor.entityId ? ` [${actor.entityId}]` : '';
      lines.push(`- ${actor.name}${bits.length ? ` (${bits.join(', ')})` : ''}${id}`);
    }
  }

  const buildingOn = snapshot.buildingOn ?? [];
  lines.push(`Building on (${buildingOn.length}):`);
  if (buildingOn.length === 0) lines.push('  (none)');
  else {
    for (const chip of buildingOn) {
      lines.push(`- ${chip.name} (${chip.type ?? 'entity'}) [${chip.id}]`);
    }
  }

  const recent = snapshot.recentMentions ?? [];
  lines.push(`Recent mentions (${recent.length}):`);
  if (recent.length === 0) lines.push('  (none)');
  else {
    for (const m of recent) {
      const bits = [
        m.lifecycleStatus,
        m.identityStage,
        m.identityConfidence != null ? `conf=${m.identityConfidence}` : null,
      ].filter(Boolean);
      lines.push(`- ${m.name}${bits.length ? ` (${bits.join(', ')})` : ''} [${m.id}]`);
    }
  }

  return lines.join('\n');
}

export function buildComposerAndContextDebugSnapshot(input: {
  chatFocus?: ChatFocus | null;
  composerDraft?: string;
  composerEntityChips?: CertifiedEntityMatch[];
  confirmingSlots?: string[];
  includedSlots?: string[];
  lexicalPreviewChips?: ComposerChipDebugSpan[];
  threadChips?: Array<{ id: string; name: string; type?: string }>;
  selectedThreadChipId?: string | null;
  entityContext?: { type: string; id: string } | null;
  composerEntitiesFromFocus?: CertifiedEntityMatch[];
}): ComposerAndContextDebugSnapshot {
  const confirming = new Set(input.confirmingSlots ?? []);
  const included = new Set(input.includedSlots ?? []);
  const mapEntity = (chip: CertifiedEntityMatch): ComposerChipDebugEntity => {
    const slot = `${chip.type}:${chip.id}`;
    return {
      id: chip.id,
      name: chip.name,
      type: chip.type,
      status: chip.status,
      matchKind: chip.matchKind,
      composerChipKind: chip.composerChipKind,
      matchedLabel: chip.matchedLabel,
      included: included.has(slot),
      confirming: confirming.has(slot),
    };
  };

  const focus = input.chatFocus;
  return {
    focusChip: focus
      ? {
          entityId: focus.entityId,
          entityName: focus.entityName,
          entityType: focus.entityType,
          sourceSurface: focus.sourceSurface,
          sourceLabel: focus.sourceLabel,
          relationshipId: focus.relationshipId,
          relationshipName: focus.relationshipName,
          knowledgeScope: focus.knowledgeScope,
          initialPrompt: focus.initialPrompt,
        }
      : null,
    composerDraft: input.composerDraft ?? '',
    composerEntityChips: (input.composerEntityChips ?? []).map(mapEntity),
    lexicalPreviewChips: input.lexicalPreviewChips ?? [],
    threadChips: input.threadChips ?? [],
    selectedThreadChipId: input.selectedThreadChipId ?? null,
    contextUsed: {
      entityContext: input.entityContext ?? null,
      composerEntitiesFromFocus: (input.composerEntitiesFromFocus ?? []).map(mapEntity),
      chatFocusPresent: Boolean(focus),
    },
  };
}

export function buildChatConversationCopyText(
  messages: Message[],
  adminDiagnostics?: AdminChatDiagnosticContext,
  composerAndContext?: ComposerAndContextDebugSnapshot,
  threadSurface?: ThreadSurfaceDebugSnapshot,
): string {
  const transcript = messages
    .map((message) => {
      const chips = (message.mentionedEntities ?? [])
        .map((entity) => `${entity.name} (${entity.type})`)
        .join(', ');
      const chipSuffix = chips ? `\n  [message chips: ${chips}]` : '';
      return `${message.role === 'user' ? 'You' : 'LoreBook'}: ${message.content}${chipSuffix}`;
    })
    .join('\n\n');

  const chipSnapshot = composerAndContext ?? adminDiagnostics?.composerAndContext;
  const chipSection = chipSnapshot
    ? formatComposerAndContextDebugSection(chipSnapshot)
    : null;
  const surfaceSnapshot = threadSurface ?? adminDiagnostics?.threadSurface;
  const surfaceSection = surfaceSnapshot
    ? formatThreadSurfaceDebugSection(surfaceSnapshot)
    : null;

  if (!adminDiagnostics) {
    return [transcript, '', surfaceSection, chipSection].filter(Boolean).join('\n');
  }

  const byMessageId = adminDiagnostics.byMessageId ?? {};
  const diagnosticMessages = messages.map((message) => {
    const snapshot = byMessageId[message.id];
    return {
      ...messageRecord(message),
      durability: snapshot?.durability ?? null,
      agentTrace: projectTrace(snapshot?.trace),
      diagnosticErrors: snapshot?.errors ?? [],
    };
  });

  const receipt = redactDiagnosticValue({
    format: 'lorebook-admin-chat-diagnostic-v1',
    generatedAt: adminDiagnostics.generatedAt ?? new Date().toISOString(),
    scope: {
      threadId: adminDiagnostics.threadId ?? null,
      messageCount: messages.length,
      note: 'Read-only export. Attempted actions are not proof that records persisted.',
    },
    threadSurface: surfaceSnapshot ?? null,
    composerAndContext: chipSnapshot ?? null,
    messages: diagnosticMessages,
    runtime: (adminDiagnostics.runtimeEvents ?? []).map((event) => ({
      phase: event.phase,
      timestamp: new Date(event.ts).toISOString(),
      durationMs: event.durationMs ?? null,
      threadId: event.threadId ?? null,
      meta: event.meta ?? null,
    })),
    privacy: {
      redacted:
        'authorization, cookies, passwords, secrets, API keys, provider tokens, and hidden prompts',
      omitted:
        'agent action payloads that may contain internal prompts or provider-specific data',
    },
  });

  return [
    transcript,
    '',
    ...(surfaceSection ? [surfaceSection, ''] : []),
    ...(chipSection ? [chipSection, ''] : []),
    '===== LOREBOOK ADMIN DIAGNOSTIC RECEIPT =====',
    JSON.stringify(receipt, null, 2),
  ].join('\n');
}
