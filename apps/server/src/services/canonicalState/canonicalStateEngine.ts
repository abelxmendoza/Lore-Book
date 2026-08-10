import { logger } from '../../logger';
import { normalizeDuplicateKey } from '../../utils/nameNormalization';
import {
  CANONICAL_MUTATION_CONTRACT_VERSION,
  canonicalMutationLayer,
  type CanonicalMutationDecision,
  type CanonicalMutationEnvelope,
} from '../canonicalMutation';
import { projectService } from '../projectService';

import type {
  CanonicalProject,
  CanonicalStateApplyResult,
  CanonicalStateDetection,
  CanonicalStateTransition,
} from './canonicalStateTypes';

const PROJECT_DORMANT_RE = /(?:^|[.!?]\s*)([\p{L}\p{N}][\p{L}\p{N} '&._-]{0,50}?)\s+(?:is not|isn't|is no longer)\s+(?:an?\s+)?active project\b/giu;
const NAMED_INACTIVE_RE = /\bi\s+(?:haven't|have not)\s+worked on\s+([\p{L}\p{N}][\p{L}\p{N} '&._-]{0,50}?)\s+since\s+([^.!?]+)/giu;
const PRONOUN_INACTIVE_RE = /\bi\s+(?:haven't|have not)\s+worked on\s+it\s+since\s+([^.!?]+)/iu;
const DETENTION_RE = /\b(?:i|we)\s+(?:(?:was|were|got|have been|had been)\s+)(detained|arrested|taken into custody)(?:\s+by\s+(?:the\s+)?police)?\b/i;

function aliases(project: CanonicalProject): string[] {
  const metadataAliases = Array.isArray(project.metadata?.aliases)
    ? (project.metadata!.aliases as unknown[]).filter((value): value is string => typeof value === 'string')
    : [];
  return [project.name, project.normalized_name, ...metadataAliases];
}

function findProject(projects: CanonicalProject[], rawName: string): CanonicalProject | null {
  const key = normalizeDuplicateKey(rawName);
  if (!key) return null;
  const exact = projects.filter((project) => aliases(project).some((name) => normalizeDuplicateKey(name) === key));
  if (exact.length === 1) return exact[0];
  const containment = projects.filter((project) => aliases(project).some((name) => {
    const candidate = normalizeDuplicateKey(name);
    return candidate.length >= 4 && (candidate.includes(key) || key.includes(candidate));
  }));
  return containment.length === 1 ? containment[0] : null;
}

function cleanSubject(value: string): string {
  return value.replace(/^(?:and|but|so|actually)\s+/i, '').trim();
}

function extractFocusLabels(text: string): string[] {
  const match = text.match(/\b(?:right now\s+)?i(?:'m| am)\s+(?:mainly|mostly|primarily)\s+focused on\s+([^.!?]+)/i)
    ?? text.match(/\b(?:my\s+)?current priorities?\s+(?:are|is)\s*:?[\s-]*([^.!?]+)/i);
  if (!match?.[1]) return [];
  return match[1]
    .replace(/\b(?:and\s+)?so forth\b/gi, '')
    .split(/\s*,\s*|\s*;\s*|\s+and\s+/i)
    .map((label) => label.replace(/^(?:(?:and|mainly|mostly)\s+)+/i, '').trim())
    .filter((label) => label.length >= 2 && label.length <= 80)
    .slice(0, 8);
}

function findLastActiveText(text: string): string | null {
  const match = text.match(/\bsince\s+((?:around\s+|about\s+)?(?:[A-Za-z]+(?:\s+\d{4})?|\d{4}|[^.!?]{1,30}))/i);
  return match?.[1]?.trim() ?? null;
}

export function detectCanonicalStateTransitions(
  text: string,
  projects: CanonicalProject[],
): CanonicalStateDetection {
  const transitions: CanonicalStateTransition[] = [];
  const unresolvedSubjects = new Set<string>();
  let lastDormantSubject: { name: string; project: CanonicalProject | null } | null = null;

  for (const match of text.matchAll(PROJECT_DORMANT_RE)) {
    const name = cleanSubject(match[1]);
    const project = findProject(projects, name);
    lastDormantSubject = { name, project };
    if (!project) unresolvedSubjects.add(name);
    transitions.push({
      type: 'PROJECT_STATUS_CHANGED',
      subject: project?.name ?? name,
      subjectId: project?.id ?? null,
      before: project?.status ?? null,
      after: 'dormant',
      confidence: 0.98,
      evidenceText: match[0].trim(),
      details: { lastActiveText: findLastActiveText(text), currentFocus: false },
    });
  }

  for (const match of text.matchAll(NAMED_INACTIVE_RE)) {
    const name = cleanSubject(match[1]);
    if (/^(?:it|this|that)$/i.test(name)) continue;
    const project = findProject(projects, name);
    if (!project) unresolvedSubjects.add(name);
    if (!transitions.some((transition) => transition.type === 'PROJECT_STATUS_CHANGED' && transition.subjectId === project?.id)) {
      transitions.push({
        type: 'PROJECT_STATUS_CHANGED', subject: project?.name ?? name, subjectId: project?.id ?? null,
        before: project?.status ?? null, after: 'dormant', confidence: 0.96, evidenceText: match[0].trim(),
        details: { lastActiveText: match[2].trim(), currentFocus: false },
      });
    }
    lastDormantSubject = { name, project };
  }

  const pronounInactive = text.match(PRONOUN_INACTIVE_RE);
  if (pronounInactive && lastDormantSubject) {
    const transition = transitions.find((candidate) =>
      candidate.type === 'PROJECT_STATUS_CHANGED' && candidate.subject === (lastDormantSubject!.project?.name ?? lastDormantSubject!.name),
    );
    if (transition) transition.details = { ...transition.details, lastActiveText: pronounInactive[1].trim() };
  }

  const focusLabels = extractFocusLabels(text);
  if (focusLabels.length > 0) {
    const focusedProjects = focusLabels.map((label) => findProject(projects, label)).filter((project): project is CanonicalProject => Boolean(project));
    const unresolvedFocus = focusLabels.filter((label) => !findProject(projects, label));
    unresolvedFocus.forEach((label) => unresolvedSubjects.add(label));
    const previousFocus = projects.filter((project) => project.metadata?.current_focus === true).map((project) => project.name);
    transitions.push({
      type: 'CURRENT_FOCUS_REPLACED', subject: 'Current Focus', subjectId: null,
      before: previousFocus, after: focusLabels, confidence: 0.97, evidenceText: focusLabels.join(', '),
      details: { resolvedProjectIds: focusedProjects.map((project) => project.id), unresolvedFocus },
    });
  }

  const detention = text.match(DETENTION_RE);
  if (detention) {
    transitions.push({
      type: 'LIFE_EVENT_DETECTED', subject: 'Police detention', subjectId: null,
      before: null, after: 'detected', confidence: 0.96, evidenceText: detention[0],
      details: { eventType: 'legal', title: 'Police detention' },
    });
  }

  return { transitions, focusLabels, unresolvedSubjects: [...unresolvedSubjects] };
}

export async function applyCanonicalStateFromMessage(input: {
  userId: string;
  sourceMessageId: string;
  text: string;
  now?: string;
}): Promise<CanonicalStateApplyResult> {
  const projects = await projectService.listProjects(input.userId);
  const detection = detectCanonicalStateTransitions(input.text, projects);
  const applied: CanonicalStateTransition[] = [];
  const unchanged: CanonicalStateTransition[] = [];
  const failed: CanonicalStateApplyResult['failed'] = [];
  const governance: CanonicalMutationDecision[] = [];
  const now = input.now ?? new Date().toISOString();
  const patches = new Map<string, { project: CanonicalProject; status?: string; importance_score?: number; metadata: Record<string, unknown>; transitions: CanonicalStateTransition[] }>();

  type PendingProjectPatch = {
    project: CanonicalProject;
    status?: string;
    importance_score?: number;
    metadata: Record<string, unknown>;
    transitions: CanonicalStateTransition[];
  };
  const patchFor = (project: CanonicalProject): PendingProjectPatch => {
    const existing = patches.get(project.id);
    if (existing) return existing;
    const patch: PendingProjectPatch = { project, metadata: { ...(project.metadata ?? {}) }, transitions: [] };
    patches.set(project.id, patch);
    return patch;
  };

  const govern = (envelope: Omit<CanonicalMutationEnvelope, 'version' | 'userId' | 'actorId'>) => {
    const decision = canonicalMutationLayer.evaluate({
      ...envelope,
      version: CANONICAL_MUTATION_CONTRACT_VERSION,
      userId: input.userId,
      actorId: input.userId,
    });
    governance.push(decision);
    return decision;
  };

  for (const transition of detection.transitions) {
    if (transition.type !== 'PROJECT_STATUS_CHANGED' || !transition.subjectId) continue;
    const project = projects.find((candidate) => candidate.id === transition.subjectId);
    if (!project) continue;
    const existingCanonicalState = project.metadata?.canonical_state as Record<string, unknown> | undefined;
    const desiredLastActive = transition.details?.lastActiveText ?? null;
    const alreadyDormant = project.status === 'dormant'
      && Number(project.importance_score ?? 50) <= 35
      && project.metadata?.current_focus !== true
      && existingCanonicalState?.status === 'dormant'
      && (existingCanonicalState?.last_active_text ?? null) === desiredLastActive;
    if (alreadyDormant) continue;
    const governanceDecision = govern({
      requestorProjection: 'project_projection',
      target: { artifactType: 'project', artifactId: project.id, field: 'status', ownerProjection: 'project_projection' },
      intent: 'RETIRE', category: 'PROJECT', previousValue: project.status, proposedValue: 'dormant',
      authority: 'USER_EXPLICIT',
      evidence: [{ sourceType: 'chat_message', sourceId: input.sourceMessageId, relation: 'SUPPORTS' }],
      risk: 'LOW', reason: 'EXPLICIT_USER_UPDATE', affectedProjections: ['project_projection', 'current_focus', 'narrative_ir', 'identity_snapshot'],
      rationale: transition.evidenceText,
    });
    if (!governanceDecision.permitted) continue;
    const patch = patchFor(project);
    patch.status = 'dormant';
    patch.importance_score = Math.min(Number(project.importance_score ?? 50), 35);
    patch.metadata = {
      ...patch.metadata,
      current_focus: false,
      canonical_state: {
        ...(typeof patch.metadata.canonical_state === 'object' && patch.metadata.canonical_state ? patch.metadata.canonical_state : {}),
        status: 'dormant',
        last_active_text: desiredLastActive,
        priority: 'low',
        source_message_id: input.sourceMessageId,
        updated_at: now,
      },
    };
    patch.transitions.push(transition);
  }

  const focusTransition = detection.transitions.find((transition) => transition.type === 'CURRENT_FOCUS_REPLACED');
  if (focusTransition) {
    const focusedIds = new Set((focusTransition.details?.resolvedProjectIds as string[] | undefined) ?? []);
    for (const project of projects) {
      const wasFocused = project.metadata?.current_focus === true;
      const isFocused = focusedIds.has(project.id);
      if (!wasFocused && !isFocused) continue;
      const importanceAlreadySet = !isFocused || Number(project.importance_score ?? 50) >= 85;
      if (wasFocused === isFocused && importanceAlreadySet) continue;
      const governanceDecision = govern({
        requestorProjection: 'project_projection',
        target: { artifactType: 'project', artifactId: project.id, field: 'metadata.current_focus', ownerProjection: 'project_projection' },
        intent: 'UPDATE', category: 'CURRENT_FOCUS', previousValue: wasFocused, proposedValue: isFocused,
      authority: 'USER_EXPLICIT',
        evidence: [{ sourceType: 'chat_message', sourceId: input.sourceMessageId, relation: 'SUPPORTS' }],
        risk: 'LOW', reason: 'EXPLICIT_USER_UPDATE', affectedProjections: ['project_projection', 'current_focus', 'identity_snapshot', 'context_plan_cache'],
        rationale: focusTransition.evidenceText,
      });
      if (!governanceDecision.permitted) continue;
      const patch = patchFor(project);
      patch.metadata = {
        ...patch.metadata,
        current_focus: isFocused,
        current_focus_source_message_id: input.sourceMessageId,
        current_focus_updated_at: now,
      };
      if (isFocused) patch.importance_score = Math.max(Number(project.importance_score ?? 50), 85);
      patch.transitions.push(focusTransition);
    }
  }

  for (const patch of patches.values()) {
    try {
      const updated = await projectService.updateProject(input.userId, patch.project.id, {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.importance_score != null ? { importance_score: patch.importance_score } : {}),
        metadata: patch.metadata,
      });
      if (!updated) throw new Error('Project update returned no owned row.');
      applied.push(...patch.transitions);
    } catch (error) {
      for (const transition of patch.transitions) failed.push({
        transition,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const transition of detection.transitions) {
    if (applied.includes(transition) || failed.some((entry) => entry.transition === transition)) continue;
    unchanged.push(transition);
  }

  const result: CanonicalStateApplyResult = {
    ...detection,
    applied: [...new Set(applied)],
    unchanged,
    failed,
    governance,
    quality: {
      stateTransitionsDetected: detection.transitions.length,
      stateTransitionsApplied: new Set(applied).size,
      canonicalProjectsReused: new Set(detection.transitions.map((transition) => transition.subjectId).filter(Boolean)).size,
      unresolvedFocusLabels: (focusTransition?.details?.unresolvedFocus as string[] | undefined)?.length ?? 0,
      governanceAutomatic: governance.filter((decision) => decision.outcome === 'ALLOW_AUTOMATIC').length,
      governanceReviewRequired: governance.filter((decision) => decision.outcome !== 'ALLOW_AUTOMATIC' && decision.outcome !== 'NO_CHANGE').length,
      // Until a database RPC can atomically update the target and append the
      // audit row, this existing compatibility write is explicitly counted.
      legacyNonAtomicWrites: patches.size,
    },
  };
  logger.info({
    userId: input.userId,
    sourceMessageId: input.sourceMessageId,
    transitions: result.transitions.map((transition) => ({ type: transition.type, subjectId: transition.subjectId, before: transition.before, after: transition.after })),
    quality: result.quality,
    failed: result.failed.length,
  }, 'Canonical state comparison complete');
  return result;
}
