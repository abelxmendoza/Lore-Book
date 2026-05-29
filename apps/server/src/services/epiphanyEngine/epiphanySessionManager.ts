/**
 * Epiphany Session Manager
 *
 * Wraps the epiphany engine with per-user isolation and DB persistence.
 * The base engine uses module-level global stores — this manager keeps
 * separate memory/interpretation/cooldown stores per user in a Map so
 * multiple users don't bleed into each other.
 *
 * Call `feedEntry(userId, entry)` after any journal entry or chat message
 * is saved. If an interpretation fires it is persisted to `epiphany_insights`
 * and returned to the caller so the system prompt can surface it.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  EpiphanyMemory,
  EpiphanyInterpretation,
  EpiphanyScope,
  EpiphanyCooldown,
} from '../../types/epiphanyEngine';

// ─── Per-user session ─────────────────────────────────────────────────────────

interface UserSession {
  memories: EpiphanyMemory[];
  interpretations: EpiphanyInterpretation[];
  cooldowns: EpiphanyCooldown[];
}

// ─── Theme / entity extraction helpers ───────────────────────────────────────

const EXCLUSION_SIGNALS = [
  /\b(excluded|left out|ignored|rejected|overlooked|dismissed|cut off|shut out|uninvited|ostracized|alone again)\b/i,
];
const CONFLICT_SIGNALS = [
  /\b(argued|argument|fight|fought|conflict|confrontation|tension|disagreement|heated|blowup|blew up|fell out)\b/i,
];
const ACCEPTANCE_SIGNALS = [
  /\b(accepted|included|welcomed|belonging|connected|understood|embraced|supported)\b/i,
];

const EMOTION_WORDS = [
  'happy', 'sad', 'angry', 'anxious', 'excited', 'frustrated', 'lonely',
  'proud', 'ashamed', 'grateful', 'hopeful', 'defeated', 'motivated',
  'overwhelmed', 'content', 'afraid', 'joyful', 'hurt', 'confident',
];

function extractThemes(text: string): string[] {
  const themes: string[] = [];
  if (EXCLUSION_SIGNALS.some(r => r.test(text))) themes.push('exclusion');
  if (CONFLICT_SIGNALS.some(r => r.test(text))) themes.push('conflict');
  if (ACCEPTANCE_SIGNALS.some(r => r.test(text))) themes.push('acceptance');
  return themes;
}

function extractEmotions(text: string): string[] {
  const lower = text.toLowerCase();
  return EMOTION_WORDS.filter(e => lower.includes(e));
}

function extractEntities(text: string): string[] {
  // Capitalized words that aren't sentence starters and aren't common stopwords
  const STOPWORDS = new Set([
    'I', 'The', 'A', 'An', 'In', 'At', 'On', 'To', 'It', 'He', 'She', 'We',
    'They', 'This', 'That', 'Is', 'Was', 'Are', 'Were', 'But', 'And', 'Or',
    'My', 'Your', 'His', 'Her', 'Our', 'Their', 'Monday', 'Tuesday',
    'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  ]);
  const matches = text.match(/\b[A-Z][a-z]{1,20}\b/g) ?? [];
  return [...new Set(matches.filter(w => !STOPWORDS.has(w)))].slice(0, 10);
}

// ─── Pure epiphany logic (per-session, no globals) ───────────────────────────

const CONFIDENCE_THRESHOLD = 0.55;
const DAY = 24 * 60 * 60 * 1000;
const COOLDOWNS: Record<EpiphanyScope, number> = {
  global: 7 * DAY,
  thread: 14 * DAY,
  timeline_node: 30 * DAY,
};

function overlap(a: string[], b: string[]): number {
  const setA = new Set(a);
  const intersection = b.filter(x => setA.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function relatedness(a: EpiphanyMemory, b: EpiphanyMemory): number {
  return (
    0.4 * overlap(a.entities, b.entities) +
    0.4 * overlap(a.themes, b.themes) +
    0.2 * overlap(a.emotions, b.emotions)
  );
}

function canEmit(session: UserSession, scope: EpiphanyScope, scopeId?: string): boolean {
  const last = session.cooldowns.find(c => c.scope === scope && c.scope_id === scopeId);
  if (!last) return true;
  return Date.now() - new Date(last.last_fired_at).getTime() > COOLDOWNS[scope];
}

function updateCooldown(session: UserSession, scope: EpiphanyScope, scopeId?: string): void {
  const existing = session.cooldowns.find(c => c.scope === scope && c.scope_id === scopeId);
  if (existing) {
    existing.last_fired_at = new Date().toISOString();
  } else {
    session.cooldowns.push({ scope, scope_id: scopeId, last_fired_at: new Date().toISOString() });
  }
}

function runPassForSession(
  session: UserSession,
  newMemory: EpiphanyMemory,
  scope: EpiphanyScope,
  scopeId?: string
): EpiphanyInterpretation | null {
  const related = session.memories.filter(
    m => m.id !== newMemory.id && relatedness(newMemory, m) >= 0.5
  );
  const memories = [newMemory, ...related];
  if (memories.length < 2) return null;

  // Detect pattern
  const exclusionCount = memories.filter(m => m.themes.includes('exclusion')).length;
  const conflictCount = memories.filter(m => m.themes.includes('conflict')).length;

  let patternTheme: string | null = null;
  let claim = '';
  if (exclusionCount >= 2) {
    patternTheme = 'exclusion';
    claim = 'There appears to be a recurring pattern of exclusion across experiences.';
  } else if (conflictCount >= 3) {
    patternTheme = 'conflict';
    claim = 'There appears to be a recurring pattern of unresolved conflict across experiences.';
  }
  if (!patternTheme) return null;

  const supporting = memories.filter(m => m.themes.includes(patternTheme!));
  const contradicting = memories.filter(m => m.themes.includes('acceptance'));
  const confidence = supporting.length / (supporting.length + contradicting.length || 1);

  if (confidence < CONFIDENCE_THRESHOLD) return null;
  if (!canEmit(session, scope, scopeId)) return null;

  const supersedes = session.interpretations
    .filter(prev => overlap(prev.supporting_memory_ids, supporting.map(m => m.id)) >= 0.6)
    .map(prev => prev.id);

  const interpretation: EpiphanyInterpretation = {
    id: crypto.randomUUID(),
    claim,
    confidence,
    supporting_memory_ids: supporting.map(m => m.id),
    contradicting_memory_ids: contradicting.map(m => m.id),
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    supersedes_interpretation_ids: supersedes,
  };

  session.interpretations.push(interpretation);
  updateCooldown(session, scope, scopeId);
  return interpretation;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class EpiphanySessionManager {
  private sessions = new Map<string, UserSession>();

  private getSession(userId: string): UserSession {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, { memories: [], interpretations: [], cooldowns: [] });
    }
    return this.sessions.get(userId)!;
  }

  /**
   * Feed a journal entry or chat message into the epiphany engine for this user.
   * Returns any interpretation that fired (null if none).
   * Fire-and-forget safe — logs errors internally.
   */
  async feedEntry(
    userId: string,
    entry: { id: string; content: string; date?: string; timestamp?: string },
    scope: EpiphanyScope = 'global',
    scopeId?: string
  ): Promise<EpiphanyInterpretation | null> {
    try {
      const text = entry.content ?? '';
      if (!text.trim()) return null;

      const themes = extractThemes(text);
      // No relevant themes — skip the pass entirely
      if (themes.length === 0) return null;

      const memory: EpiphanyMemory = {
        id: entry.id,
        timestamp: entry.date ?? entry.timestamp ?? new Date().toISOString(),
        text,
        entities: extractEntities(text),
        themes,
        emotions: extractEmotions(text),
      };

      const session = this.getSession(userId);
      session.memories.push(memory);

      const interpretation = runPassForSession(session, memory, scope, scopeId);
      if (!interpretation) return null;

      // Persist to DB (non-blocking — failure should not surface to caller)
      await this.persist(userId, interpretation).catch(err => {
        logger.warn({ err, userId, interpretationId: interpretation.id }, 'epiphany: persist failed');
      });

      logger.info(
        { userId, claim: interpretation.claim, confidence: interpretation.confidence },
        'epiphany: interpretation fired'
      );

      return interpretation;
    } catch (err) {
      logger.warn({ err, userId }, 'epiphany: feedEntry failed');
      return null;
    }
  }

  /**
   * Return the latest (most recent) interpretation for this user, if any.
   * Used to optionally surface in system prompt.
   */
  getLatestInterpretation(userId: string): EpiphanyInterpretation | null {
    const session = this.sessions.get(userId);
    if (!session || session.interpretations.length === 0) return null;
    return session.interpretations[session.interpretations.length - 1];
  }

  /**
   * Clear the in-memory session for a user (e.g. after a long idle period).
   */
  clearSession(userId: string): void {
    this.sessions.delete(userId);
  }

  private async persist(userId: string, interpretation: EpiphanyInterpretation): Promise<void> {
    const { error } = await supabaseAdmin.from('epiphany_insights').insert({
      id: interpretation.id,
      user_id: userId,
      claim: interpretation.claim,
      confidence: interpretation.confidence,
      supporting_memory_ids: interpretation.supporting_memory_ids,
      contradicting_memory_ids: interpretation.contradicting_memory_ids,
      supersedes_interpretation_ids: interpretation.supersedes_interpretation_ids,
      created_at: interpretation.created_at,
    });
    if (error) throw error;
  }
}

export const epiphanySessionManager = new EpiphanySessionManager();
