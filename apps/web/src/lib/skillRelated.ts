import { isPrimarySkillBookRecord } from './skillOntology';
import { skillAliasesFromMetadata } from './skillAliases';
import type { Skill } from '../types/skill';

const GENERIC = new Set([
  'development',
  'developer',
  'engineering',
  'management',
  'skill',
  'skills',
  'training',
  'practice',
  'operations',
  'professional',
]);

function key(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    key(value)
      .split(' ')
      .filter((token) => token.length > 1 && !GENERIC.has(token)),
  );
}

function relatedScore(left: Skill, right: Skill): number {
  const leftTokens = tokens(left.skill_name);
  const rightTokens = tokens(right.skill_name);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
  if ([...smaller].every((token) => larger.has(token))) return 0.8;
  let inter = 0;
  for (const token of smaller) if (larger.has(token)) inter += 1;
  if (inter === 0) return 0;
  return inter / (leftTokens.size + rightTokens.size - inter);
}

function aliasHit(left: Skill, right: Skill): boolean {
  const names = new Set([
    key(left.skill_name),
    ...skillAliasesFromMetadata(left.metadata).map(key),
  ]);
  if (names.has(key(right.skill_name))) return true;
  return skillAliasesFromMetadata(right.metadata).some((alias) => names.has(key(alias)));
}

export function findRelatedBookSkills(skill: Skill, peers: Skill[]): Skill[] {
  return peers
    .filter((peer) => peer.id !== skill.id && isPrimarySkillBookRecord(peer))
    .map((peer) => ({
      peer,
      score: aliasHit(skill, peer) ? 1 : relatedScore(skill, peer),
    }))
    .filter((row) => row.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.peer.skill_name.localeCompare(b.peer.skill_name))
    .map((row) => row.peer);
}
