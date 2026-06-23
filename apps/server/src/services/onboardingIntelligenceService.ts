import { config } from '../config';
import { openai } from '../lib/openai';
import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';
import { selfCharacterService } from './selfCharacterService';
import { entityFactsService } from './entityFactsService';

/**
 * Onboarding Intelligence — turn a narrative ("tell me about yourself") into a
 * structured identity graph instead of a 20-field form.
 *
 * Philosophy: the user tells a story; we extract people/places/orgs/skills/goals/
 * projects/events/values/interests + a core identity, show confirmation chips, and
 * on confirm we (a) populate the user's Main Character (the self character — their
 * knowledge-base container) and (b) link the narrative's "I/me/my" facts to them.
 *
 * The self character's metadata IS the durable container: `onboarding_profile`
 * holds the confirmed graph, `onboarding_v2_completed_at` drives the re-prompt for
 * existing users. No new table required.
 */

export type IdentityChip = { label: string; confidence: number; evidence?: string };

export type IdentityProfileDraft = {
  identity: {
    preferredName?: string;
    occupation?: string;
    lifePhase?: string;
    summary?: string;
  };
  people: IdentityChip[];
  places: IdentityChip[];
  organizations: IdentityChip[];
  skills: IdentityChip[];
  interests: IdentityChip[];
  goals: IdentityChip[];
  projects: IdentityChip[];
  events: IdentityChip[];
  values: IdentityChip[];
};

const EMPTY_DRAFT: IdentityProfileDraft = {
  identity: {},
  people: [],
  places: [],
  organizations: [],
  skills: [],
  interests: [],
  goals: [],
  projects: [],
  events: [],
  values: [],
};

const ONBOARDING_VERSION = 2;

const SYSTEM_PROMPT = `You extract a structured identity graph from a person's free-form description of themselves and their life. Return STRICT JSON only.

Return this exact shape (omit nothing; use [] / "" when unknown):
{
  "identity": { "preferredName": string, "occupation": string, "lifePhase": string, "summary": string },
  "people": [{ "label": string, "confidence": number, "evidence": string }],
  "places": [...],
  "organizations": [...],
  "skills": [...],
  "interests": [...],
  "goals": [...],
  "projects": [...],
  "events": [...],
  "values": [...]
}

Rules:
- Infer aggressively but honestly. "I'm a mechanical engineer at Tesla" → occupation "Mechanical Engineer", organization "Tesla", skill "Engineering".
- "my girlfriend Sarah" → person "Sarah" (evidence carries the relationship).
- confidence is 0..1. summary is a warm 1-2 sentence description in third person.
- lifePhase is a short label like "starting a new job", "raising kids", "in school".
- Do NOT invent specifics that aren't supported by the text.`;

function toChips(raw: unknown): IdentityChip[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      if (typeof r === 'string') return { label: r.trim(), confidence: 0.6 };
      if (r && typeof r === 'object') {
        const o = r as Record<string, unknown>;
        const label = typeof o.label === 'string' ? o.label.trim() : '';
        if (!label) return null;
        return {
          label,
          confidence: typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.7,
          evidence: typeof o.evidence === 'string' ? o.evidence : undefined,
        };
      }
      return null;
    })
    .filter((c): c is IdentityChip => !!c && c.label.length > 0);
}

class OnboardingIntelligenceService {
  /** Narrative → structured identity draft (confirmation chips). One LLM call. */
  async extractIdentityProfile(userId: string, narrative: string): Promise<IdentityProfileDraft> {
    const text = narrative?.trim();
    if (!text) return { ...EMPTY_DRAFT };

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<string, unknown>;
      const identity = (parsed.identity ?? {}) as Record<string, unknown>;

      return {
        identity: {
          preferredName: typeof identity.preferredName === 'string' ? identity.preferredName.trim() : undefined,
          occupation: typeof identity.occupation === 'string' ? identity.occupation.trim() : undefined,
          lifePhase: typeof identity.lifePhase === 'string' ? identity.lifePhase.trim() : undefined,
          summary: typeof identity.summary === 'string' ? identity.summary.trim() : undefined,
        },
        people: toChips(parsed.people),
        places: toChips(parsed.places),
        organizations: toChips(parsed.organizations),
        skills: toChips(parsed.skills),
        interests: toChips(parsed.interests),
        goals: toChips(parsed.goals),
        projects: toChips(parsed.projects),
        events: toChips(parsed.events),
        values: toChips(parsed.values),
      };
    } catch (err) {
      logger.warn({ err, userId }, 'onboardingIntelligence: extraction failed');
      return { ...EMPTY_DRAFT };
    }
  }

  /**
   * Persist a confirmed draft into the user's Main Character (self character)
   * knowledge base + link the narrative's self-facts, and mark onboarding done.
   */
  async confirmIdentityProfile(
    userId: string,
    draft: IdentityProfileDraft,
    narrative?: string,
  ): Promise<{ selfCharacterId: string | null; completed: boolean }> {
    const self = await selfCharacterService.ensureSelfCharacter(userId);
    if (!self || typeof self.id !== 'string') {
      logger.warn({ userId }, 'onboardingIntelligence: no self character to populate');
      return { selfCharacterId: null, completed: false };
    }
    const selfId = self.id;
    const existingMeta = (self.metadata && typeof self.metadata === 'object'
      ? (self.metadata as Record<string, unknown>)
      : {});

    const metadata = {
      ...existingMeta,
      onboarding_profile: draft,
      onboarding_v2_completed_at: new Date().toISOString(),
      onboarding_version: ONBOARDING_VERSION,
      ...(draft.identity.occupation ? { occupation: draft.identity.occupation } : {}),
      ...(draft.identity.lifePhase ? { life_phase: draft.identity.lifePhase } : {}),
      ...(draft.values.length ? { values: draft.values.map((v) => v.label) } : {}),
      ...(draft.interests.length ? { interests: draft.interests.map((i) => i.label) } : {}),
    };

    const update: Record<string, unknown> = { metadata, updated_at: new Date().toISOString() };
    if (draft.identity.summary) update.summary = draft.identity.summary;

    const { error } = await supabaseAdmin
      .from('characters')
      .update(update)
      .eq('id', selfId)
      .eq('user_id', userId);
    if (error) {
      logger.warn({ err: error, userId }, 'onboardingIntelligence: self character update failed');
    }

    // Link the narrative's "I/me/my" facts to the user (best-effort, non-blocking).
    if (narrative?.trim()) {
      entityFactsService
        .extractAndPersistSelfFacts(userId, selfId, narrative.trim())
        .catch((err) => logger.debug({ err, userId }, 'self-fact link failed'));
    }

    return { selfCharacterId: selfId, completed: true };
  }

  /** Completion state — drives the re-prompt for existing users. */
  async getOnboardingStatus(
    userId: string,
  ): Promise<{ completed: boolean; version: number; hasSelfProfile: boolean; completedAt: string | null }> {
    const self = await selfCharacterService.ensureSelfCharacter(userId);
    const meta = (self?.metadata && typeof self.metadata === 'object'
      ? (self.metadata as Record<string, unknown>)
      : {});
    const completedAt =
      typeof meta.onboarding_v2_completed_at === 'string' ? meta.onboarding_v2_completed_at : null;
    return {
      completed: !!completedAt,
      version: typeof meta.onboarding_version === 'number' ? meta.onboarding_version : 0,
      hasSelfProfile: !!self,
      completedAt,
    };
  }
}

export const onboardingIntelligenceService = new OnboardingIntelligenceService();
