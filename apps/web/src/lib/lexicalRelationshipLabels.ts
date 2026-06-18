/**
 * Labels + helpers for lexical relationship / discourse signals in the UI.
 */

export type LexicalSignalMove = { move: string; cue?: string; confidence?: number };
export type LexicalSignalRole = { role: string; cue?: string; confidence?: number; attributedToSelf?: boolean };
export type LexicalSignalRomantic = {
  status: string;
  relationshipType?: string;
  cue?: string;
  isSituationship?: boolean;
  tags?: string[];
};
export type LexicalSignalStage = { stage: string; cue?: string };

export type LexicalSignals = {
  discourse_moves?: LexicalSignalMove[];
  social_roles?: LexicalSignalRole[];
  romantic_signals?: LexicalSignalRomantic[];
  narrative_stages?: LexicalSignalStage[];
  is_story_block?: boolean;
};

export const SOCIAL_ROLE_LABELS: Record<string, string> = {
  bestie: 'Bestie',
  ally: 'Ally',
  homie: 'Homie',
  close_friend: 'Close friend',
  platonic_love: 'Platonic love',
  acquaintance: 'Acquaintance',
  mentor: 'Mentor',
  roommate: 'Roommate',
};

export const ROMANTIC_STATUS_LABELS: Record<string, string> = {
  ghosted: 'Ghosted',
  active: 'Active',
  ended: 'Ended',
  complicated: 'Complicated',
  blocked: 'Blocked',
};

export const ROMANTIC_TAG_LABELS: Record<string, string> = {
  soft_launch: 'Soft launch',
  dtr: 'DTR',
  ick: 'The ick',
  breadcrumbing: 'Breadcrumbing',
  rekindling: 'Rekindling',
  situationship: 'Situationship',
};

export const DISCOURSE_LABELS: Record<string, string> = {
  TANGENT: 'Tangent',
  SUBJECT_CHANGE: 'Subject change',
  STORY_OPEN: 'Story opens',
  STORY_CLOSE: 'Story closes',
  DIGRESSION: 'Digression',
  RETURN: 'Returns to topic',
};

export const STAGE_LABELS: Record<string, string> = {
  SETUP: 'Setup',
  INCITING: 'Inciting',
  ESCALATION: 'Escalation',
  CLIMAX: 'Climax',
  FALLING: 'Falling',
  REFLECTION: 'Reflection',
  CODA: 'Coda',
};

export function extractLexicalSignals(
  metadata?: Record<string, unknown> | null,
): LexicalSignals | null {
  const raw = metadata?.lexical_signals;
  if (!raw || typeof raw !== 'object') return null;
  return raw as LexicalSignals;
}

export type LexicalBadge = {
  key: string;
  label: string;
  tone: 'social' | 'romantic' | 'discourse' | 'stage';
};

/** Flatten lexical_signals into display badges (deduped). */
export function lexicalBadgesFromSignals(signals: LexicalSignals | null | undefined): LexicalBadge[] {
  if (!signals) return [];
  const out: LexicalBadge[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string, tone: LexicalBadge['tone']) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label, tone });
  };

  for (const r of signals.social_roles ?? []) {
    if (r.attributedToSelf === false) continue;
    push(`social:${r.role}`, SOCIAL_ROLE_LABELS[r.role] ?? r.role.replace(/_/g, ' '), 'social');
  }

  for (const r of signals.romantic_signals ?? []) {
    if (r.isSituationship) push('rom:situationship', 'Situationship', 'romantic');
    if (r.status === 'ghosted') push('rom:ghosted', 'Ghosted', 'romantic');
    for (const tag of r.tags ?? []) {
      push(`rom:${tag}`, ROMANTIC_TAG_LABELS[tag] ?? tag.replace(/_/g, ' '), 'romantic');
    }
    if (r.status && r.status !== 'active') {
      push(`rom:status:${r.status}`, ROMANTIC_STATUS_LABELS[r.status] ?? r.status, 'romantic');
    }
  }

  for (const d of signals.discourse_moves ?? []) {
    push(`disc:${d.move}`, DISCOURSE_LABELS[d.move] ?? d.move.replace(/_/g, ' '), 'discourse');
  }

  for (const s of signals.narrative_stages ?? []) {
    push(`stage:${s.stage}`, STAGE_LABELS[s.stage] ?? s.stage, 'stage');
  }

  return out.slice(0, 8);
}

export function lexicalBadgesFromRelationship(rel: {
  status?: string;
  is_situationship?: boolean;
  relationship_type?: string;
  metadata?: Record<string, unknown> | null;
}): LexicalBadge[] {
  const fromMeta = lexicalBadgesFromSignals(extractLexicalSignals(rel.metadata));
  if (fromMeta.length > 0) return fromMeta;

  const out: LexicalBadge[] = [];
  if (rel.is_situationship) out.push({ key: 'situationship', label: 'Situationship', tone: 'romantic' });
  if (rel.status === 'ghosted') out.push({ key: 'ghosted', label: 'Ghosted', tone: 'romantic' });
  if (rel.relationship_type === 'situationship') {
    out.push({ key: 'situationship-type', label: 'Situationship', tone: 'romantic' });
  }
  return out;
}

export const BADGE_TONE_CLASS: Record<LexicalBadge['tone'], string> = {
  social: 'border-sky-500/35 bg-sky-500/10 text-sky-200',
  romantic: 'border-pink-500/35 bg-pink-500/10 text-pink-200',
  discourse: 'border-violet-500/35 bg-violet-500/10 text-violet-200',
  stage: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
};
