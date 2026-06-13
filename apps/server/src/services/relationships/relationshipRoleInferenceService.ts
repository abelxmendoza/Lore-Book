/**
 * Relationship Role Inference Service
 *
 * Infers social hierarchy and role from natural language.
 * No manual entry required — reads how people actually write.
 *
 * "my boss" → { domain: 'workplace', role: 'supervisor', hierarchy: 'above', confidence: 0.94 }
 * "my grandma" → { domain: 'family', role: 'grandparent', hierarchy: 'above', confidence: 0.97 }
 * "my sensei" → { domain: 'sports', role: 'coach', hierarchy: 'above', confidence: 0.95 }
 */

import { ROLE_PATTERNS, type RelationshipRole, type SocialDomain, type HierarchyDirection } from './socialRoleTaxonomy';

// ─── Main inference function ──────────────────────────────────────────────────

/**
 * Infer roles from a block of text (journal entry, chat message, character description).
 * Returns all matches sorted by confidence descending.
 */
export function inferRolesFromText(text: string): RelationshipRole[] {
  const results: RelationshipRole[] = [];

  for (const entry of ROLE_PATTERNS) {
    for (const pattern of entry.patterns) {
      const match = text.match(pattern);
      if (match) {
        results.push({
          domain: entry.domain,
          role: entry.role,
          hierarchy: entry.hierarchy,
          confidence: entry.confidence,
          inferred_from: match[0],
        });
        break; // one match per pattern group is enough
      }
    }
  }

  // Deduplicate by role+domain (keep highest confidence)
  const deduped = new Map<string, RelationshipRole>();
  for (const r of results) {
    const key = `${r.domain}:${r.role}`;
    if (!deduped.has(key) || r.confidence > deduped.get(key)!.confidence) {
      deduped.set(key, r);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Infer the single most likely role for a person given text about them.
 * Uses the highest-confidence match.
 */
export function inferPrimaryRole(text: string): RelationshipRole | null {
  const roles = inferRolesFromText(text);
  return roles.length > 0 ? roles[0] : null;
}

/**
 * Infer role for a specific character name within a text.
 * Scans for patterns like "Sarah is my boss" or "talked to my boss Sarah".
 */
export function inferRoleForPerson(personName: string, text: string): RelationshipRole | null {
  const firstName = personName.split(' ')[0];

  // Pattern: "[name] ... my [role]" or "my [role] [name]" or "[name], my [role]"
  const nameContextPatterns = [
    new RegExp(`${firstName}[^.]*?my\\s+\\w+`, 'gi'),
    new RegExp(`my\\s+\\w+[^.]*?${firstName}`, 'gi'),
    new RegExp(`${firstName},?\\s+my\\s+\\w+`, 'gi'),
  ];

  for (const ctxPattern of nameContextPatterns) {
    const snippet = text.match(ctxPattern)?.[0];
    if (snippet) {
      const role = inferPrimaryRole(snippet);
      if (role) return role;
    }
  }

  // Fall back to searching entire text if no name-specific snippet matched
  return inferPrimaryRole(text);
}

/**
 * Given a character's stored role string and description, produce a structured role.
 * Useful for processing existing character metadata.
 */
export function inferRoleFromDescription(role: string, summary?: string): RelationshipRole | null {
  const combined = [role, summary ?? ''].join(' ');
  const result = inferPrimaryRole(combined);
  if (result) return result;

  // Last-resort: classify by role keyword alone
  return classifyByRoleKeyword(role);
}

// ─── Hierarchy helpers ────────────────────────────────────────────────────────

export function hierarchyLabel(direction: HierarchyDirection): string {
  const labels: Record<HierarchyDirection, string> = {
    above:   'Reports to you',
    below:   'You report to them',
    same:    'Peer',
    lateral: 'Connected',
    unknown: 'Unknown',
  };
  return labels[direction];
}

export function hierarchyIcon(direction: HierarchyDirection): string {
  return direction === 'above' ? '↑' : direction === 'below' ? '↓' : direction === 'same' ? '↔' : '↗';
}

export function domainLabel(domain: SocialDomain): string {
  const labels: Record<SocialDomain, string> = {
    family:    'Family',
    workplace: 'Work',
    education: 'Education',
    sports:    'Sports & Fitness',
    community: 'Community',
    health:    'Health',
    creative:  'Creative',
    social:    'Social',
    spiritual: 'Spiritual',
    unknown:   'Unknown',
  };
  return labels[domain];
}

// ─── Role keyword fallback ────────────────────────────────────────────────────

function classifyByRoleKeyword(role: string): RelationshipRole | null {
  const r = role.toLowerCase();

  const quickMap: Array<[RegExp, SocialDomain, string, HierarchyDirection]> = [
    [/^(?:my\s+)?(?:parent|father|mother|mom|dad)\b/, 'family', 'parent', 'above'],
    [/^(?:my\s+)?(?:sibling|brother|sister)\b/, 'family', 'sibling', 'lateral'],
    [/^(?:my\s+)?(?:cousin)\b/, 'family', 'cousin', 'lateral'],
    [/^(?:my\s+)?(?:grandparent|grandma|grandpa|abuela|abuelo)\b/, 'family', 'grandparent', 'above'],
    [/^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt)\b/, 'family', 'aunt_uncle', 'above'],
    [/boss|manager|supervisor|lead|director/, 'workplace', 'supervisor', 'above'],
    [/coworker|colleague|teammate/, 'workplace', 'peer', 'same'],
    [/professor|teacher|instructor/, 'education', 'teacher', 'above'],
    [/student|pupil/, 'education', 'student', 'below'],
    [/coach|trainer|sensei/, 'sports', 'coach', 'above'],
    [/therapist|counselor/, 'health', 'therapist', 'lateral'],
    [/friend/, 'social', 'friend', 'same'],
    [/mentor/, 'workplace', 'mentor', 'above'],
    [/life coach/, 'community', 'life_coach', 'above'],
  ];

  for (const [pattern, domain, roleName, hierarchy] of quickMap) {
    if (pattern.test(r)) {
      return { domain, role: roleName, hierarchy, confidence: 0.75 };
    }
  }

  return null;
}

// ─── Batch processing ────────────────────────────────────────────────────────

/**
 * Process multiple journal entries for a character and return the most
 * consistently inferred role across all entries.
 */
export function inferRoleFromEntries(
  personName: string,
  entries: Array<{ content: string; date: string }>
): RelationshipRole | null {
  const tallies = new Map<string, { role: RelationshipRole; count: number; totalConf: number }>();

  for (const entry of entries) {
    const role = inferRoleForPerson(personName, entry.content);
    if (!role) continue;
    const key = `${role.domain}:${role.role}`;
    const existing = tallies.get(key);
    if (existing) {
      existing.count++;
      existing.totalConf += role.confidence;
    } else {
      tallies.set(key, { role, count: 1, totalConf: role.confidence });
    }
  }

  if (tallies.size === 0) return null;

  // Pick the role with most mentions, weighted by confidence
  let best: { role: RelationshipRole; score: number } | null = null;
  for (const { role, count, totalConf } of tallies.values()) {
    const score = count * (totalConf / count); // frequency × avg confidence
    if (!best || score > best.score) {
      best = { role: { ...role, confidence: Math.min(0.99, totalConf / count + (count - 1) * 0.02) }, score };
    }
  }

  return best?.role ?? null;
}
