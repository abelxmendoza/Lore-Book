/**
 * Relationship resolution — normalize kinship, work, and social roles.
 */
import { discoverRelationshipHints, inferRelationshipRole } from '../ontology/lexicalIntelligence';
import { discoverEntityLinks } from '../ontology/relationshipDiscovery';
import { hintToDefaultRole, roleToScope } from '../ontology/canonical/relationshipKnowledge';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { RelationshipRole, ResolvedRelationship } from './meaningResolutionTypes';
import { padForScan } from '../lexical/lexicalNormalizer';

const FAMILY_ROMANTIC: RelationshipRole[] = [
  'mother', 'father', 'estranged_father', 'estranged_mother', 'sibling', 'cousin',
  'romantic_partner', 'ex_partner',
];

const ROLE_PATTERNS: Array<{ role: RelationshipRole; patterns: RegExp[] }> = [
  { role: 'estranged_father', patterns: [/\bmy\s+estranged\s+father\b/i, /\bestranged\s+father\b/i] },
  { role: 'estranged_mother', patterns: [/\bmy\s+estranged\s+mother\b/i, /\bestranged\s+mother\b/i] },
  { role: 'mother', patterns: [/\bmy\s+mother\b/i, /\bmy\s+mom\b/i] },
  { role: 'father', patterns: [/\bmy\s+father\b/i, /\bmy\s+dad\b/i] },
  { role: 'sibling', patterns: [/\bmy\s+(?:brother|sister|sibling)\b/i] },
  { role: 'cousin', patterns: [/\bmy\s+cousin\b/i] },
  { role: 'close_friend', patterns: [/\bmy\s+best\s+friend\b/i, /\bclose\s+friend\b/i] },
  { role: 'friend', patterns: [/\bmy\s+friend\b/i] },
  { role: 'romantic_partner', patterns: [/\bmy\s+(?:boyfriend|girlfriend|partner|husband|wife)\b/i] },
  { role: 'ex_partner', patterns: [/\bmy\s+ex\b/i] },
  { role: 'coworker', patterns: [/\bmy\s+coworker\b/i, /\bcolleague\b/i] },
  { role: 'boss', patterns: [/\bmy\s+boss\b/i, /\bmy\s+manager\b/i] },
  { role: 'mentor', patterns: [/\bmy\s+mentor\b/i] },
  { role: 'student', patterns: [/\bmy\s+student\b/i] },
  { role: 'rival', patterns: [/\bmy\s+rival\b/i, /\bnemesis\b/i] },
  { role: 'coach', patterns: [/\bmy\s+coach\b/i] },
  { role: 'teammate', patterns: [/\bmy\s+teammate\b/i] },
  { role: 'acquaintance', patterns: [/\bacquaintance\b/i] },
  { role: 'promoter', patterns: [/\bpromoter\b/i] },
  { role: 'vendor', patterns: [/\bvendor\b/i] },
  { role: 'community_member', patterns: [/\bcommunity\s+member\b/i] },
];

export function resolveRelationships(
  text: string,
  lexical: LexicalAnalysisResult,
  charByName: Map<string, { id: string; name: string }>
): ResolvedRelationship[] {
  const results: ResolvedRelationship[] = [];
  const seen = new Set<string>();

  for (const { role, patterns } of ROLE_PATTERNS) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (!m) continue;
      if (seen.has(role)) break;
      seen.add(role);

      const nameMatch = text.match(
        new RegExp(`([A-Z][\\w'.-]*(?:\\s+[A-Z][\\w'.-]*){0,2})\\s+(?:is|was)\\s+my\\s+${role.replace('estranged_', '')}`, 'i')
      );
      const targetName = nameMatch?.[1];
      const targetEntityId = targetName
        ? charByName.get(targetName.trim().toLowerCase())?.id
        : undefined;

      results.push({
        role,
        targetName,
        targetEntityId,
        cue: m[0],
        sentiment: role.startsWith('estranged') ? 'estranged' : 'neutral',
        confidence: 0.82,
        resolutionReason: `pattern:${role}`,
        requiresConfirmation: FAMILY_ROMANTIC.includes(role),
      });
      break;
    }
  }

  const inferred = inferRelationshipRole(text);
  if (inferred && !seen.has(inferred)) {
    const role = /\bestranged\b/i.test(text) && inferred === 'father'
      ? 'estranged_father' as RelationshipRole
      : inferred as RelationshipRole;
    results.push({
      role,
      cue: inferred,
      sentiment: /\bestranged\b/i.test(text) ? 'estranged' : 'neutral',
      confidence: 0.75,
      resolutionReason: 'inferred_role',
      requiresConfirmation: FAMILY_ROMANTIC.includes(role) || role === 'father' || role === 'mother',
    });
  }

  for (const h of discoverRelationshipHints(text)) {
    const mapped = mapHint(h.hint);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    results.push({
      role: mapped,
      cue: h.cue,
      sentiment: h.hint === 'ADVERSARIAL_RELATIONSHIP' ? 'estranged' : 'neutral',
      confidence: h.confidence,
      resolutionReason: `glossary:${h.cue}`,
      requiresConfirmation: FAMILY_ROMANTIC.includes(mapped),
    });
  }

  for (const rel of lexical.relationships) {
    if (seen.has(rel.role)) continue;
    seen.add(rel.role);
    results.push({
      role: rel.role as RelationshipRole,
      targetName: rel.target,
      targetEntityId: rel.target
        ? charByName.get(rel.target.trim().toLowerCase())?.id
        : undefined,
      cue: rel.cue,
      sentiment: rel.sentiment === 'estranged' ? 'estranged' : 'neutral',
      confidence: rel.confidence,
      resolutionReason: `lexical:${rel.cue}`,
      requiresConfirmation: FAMILY_ROMANTIC.includes(rel.role as RelationshipRole),
    });
  }

  // Enrich with discovered entity links (named targets from patterns)
  const links = lexical.entityLinks ?? discoverEntityLinks(text, lexical.entities, lexical.relationships);
  for (const link of links) {
    if (link.subject !== 'self' || !link.object || link.object === link.role) continue;
    const role = (link.role ?? hintToDefaultRole(link.hint ?? 'SOCIAL_RELATIONSHIP')) as RelationshipRole;
    const dedupeKey = `${role}:${link.object}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push({
      role,
      targetName: link.object,
      targetEntityId: charByName.get(link.object.trim().toLowerCase())?.id,
      cue: link.cue,
      sentiment: role.startsWith('estranged') ? 'estranged' : 'neutral',
      confidence: link.confidence,
      resolutionReason: `entity_link:${link.relationshipType}`,
      requiresConfirmation: FAMILY_ROMANTIC.includes(role) || roleToScope(role) === 'FAMILY',
    });
  }

  return results;
}

function mapHint(hint: string): RelationshipRole | null {
  switch (hint) {
    case 'FAMILY_RELATIONSHIP': return 'cousin';
    case 'WORK_RELATIONSHIP': return 'coworker';
    case 'ROMANTIC_RELATIONSHIP': return 'romantic_partner';
    case 'SOCIAL_RELATIONSHIP': return 'friend';
    case 'ADVERSARIAL_RELATIONSHIP': return 'rival';
    case 'MENTOR_RELATIONSHIP': return 'mentor';
    case 'CREATIVE_RELATIONSHIP': return 'promoter';
    default: return null;
  }
}

export function isFamilyOrRomantic(role: RelationshipRole): boolean {
  return FAMILY_ROMANTIC.includes(role);
}
