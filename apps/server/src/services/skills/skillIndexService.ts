import { skillService } from './skillService';
import { normalizeSkillKey } from './skillIdentity';

export type SkillIndexEntry = {
  id: string;
  skill_name: string;
  skill_key: string;
  skill_category: string;
  parent_skill_ids?: string[];
};

const SKILL_INDEX_TTL_MS = 60_000;
const SKILL_INDEX_CACHE_MAX_ENTRIES = 500;

/** In-memory index of confirmed skills — keyed by normalized name for chat/pipeline lookups. */
class SkillIndexService {
  private cache = new Map<string, { at: number; entries: Map<string, SkillIndexEntry> }>();
  private readonly ttlMs = SKILL_INDEX_TTL_MS;

  private setCache(userId: string, entries: Map<string, SkillIndexEntry>): void {
    this.cache.set(userId, { at: Date.now(), entries });
    if (this.cache.size <= SKILL_INDEX_CACHE_MAX_ENTRIES) return;

    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.at > this.ttlMs) this.cache.delete(key);
    }
    while (this.cache.size > SKILL_INDEX_CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  async getIndex(userId: string): Promise<Map<string, SkillIndexEntry>> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.entries;

    const skills = await skillService.getSkills(userId, { active_only: false });
    const entries = new Map<string, SkillIndexEntry>();
    for (const s of skills) {
      const profile = (s.metadata?.skill_profile ?? {}) as Record<string, unknown>;
      const key = String(s.metadata?.skill_key ?? normalizeSkillKey(s.skill_name));
      const entry: SkillIndexEntry = {
        id: s.id,
        skill_name: s.skill_name,
        skill_key: key,
        skill_category: s.skill_category,
        parent_skill_ids: Array.isArray(profile.parent_skill_ids)
          ? (profile.parent_skill_ids as string[])
          : undefined,
      };
      entries.set(key, entry);
      entries.set(normalizeSkillKey(s.skill_name), entry);
    }
    this.setCache(userId, entries);
    return entries;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  async resolve(userId: string, name: string): Promise<SkillIndexEntry | null> {
    const index = await this.getIndex(userId);
    return index.get(normalizeSkillKey(name)) ?? null;
  }

  /** Compact list for chat system prompt injection. */
  async listForContext(userId: string, limit = 24): Promise<Array<{ id: string; name: string; category: string }>> {
    const skills = await skillService.getSkills(userId, { active_only: true });
    return skills.slice(0, limit).map((s) => ({
      id: s.id,
      name: s.skill_name,
      category: s.skill_category,
    }));
  }
}

export const skillIndexService = new SkillIndexService();
