import type { SensitivityClass } from './types';

const SENSITIVE_PATTERNS: Array<{ cls: SensitivityClass; re: RegExp }> = [
  { cls: 'sexual', re: /\b(sex|sexual|hookup|intimate|bedroom|nude)\b/i },
  { cls: 'dating', re: /\b(dating|girlfriend|boyfriend|crush|romance|dancing|kiss)\b/i },
  { cls: 'rejection', re: /\b(rejected|rejection|ghosted|turned.?down|pulled away)\b/i },
  { cls: 'conflict', re: /\b(fight|argued|conflict|yelled|hostile|abusive)\b/i },
  { cls: 'workplace_fear', re: /\b(fired|layoff|hostile work|afraid at work|hr complaint)\b/i },
  { cls: 'family', re: /\b(mom|dad|mother|father|family trauma|sibling abuse)\b/i },
  { cls: 'health', re: /\b(diagnosis|depression|anxiety disorder|cancer|illness|therapy session)\b/i },
  { cls: 'finances', re: /\b(bankruptcy|debt|salary|eviction|broke|financial crisis)\b/i },
  { cls: 'embarrassment', re: /\b(embarrassed|humiliated|ashamed|awkward moment)\b/i },
];

export function inferSensitivity(summary: string, explicit?: SensitivityClass): SensitivityClass {
  if (explicit && explicit !== 'none') return explicit;
  for (const { cls, re } of SENSITIVE_PATTERNS) {
    if (re.test(summary)) return cls;
  }
  return 'none';
}

/**
 * Sensitive memories need stronger relevance than ordinary facts.
 * Returns required composite threshold boost and whether allowed.
 */
export function sensitivityGate(
  sensitivity: SensitivityClass,
  composite: number,
  entityRelevance: number,
  causalRelevance: number,
  opts?: { goalRelevance?: number; semanticRelevance?: number },
): { allowed: boolean; reason: string; penalty: number } {
  if (sensitivity === 'none') {
    return { allowed: true, reason: 'not_sensitive', penalty: 0 };
  }

  const goal = opts?.goalRelevance ?? 0;
  const semantic = opts?.semanticRelevance ?? 0;

  // Strong causal/continuity bridge unlocks lessons (e.g. Genni → dancing boundaries)
  // even when the earlier person is not renamed in the later message.
  // Family support around interviews/career is allowed when goal+semantic align.
  const familyCareerOk =
    sensitivity === 'family' && (goal >= 0.45 || semantic >= 0.55) && composite >= 0.32;
  const strongLink =
    (entityRelevance >= 0.5 && (causalRelevance >= 0.35 || composite >= 0.55)) ||
    (causalRelevance >= 0.55 && composite >= 0.45) ||
    (entityRelevance >= 0.55 && composite >= 0.5) ||
    familyCareerOk;
  if (strongLink) {
    return {
      allowed: true,
      reason: 'sensitive_but_strong_relevance',
      penalty: familyCareerOk ? 0.02 : 0.05,
    };
  }

  // Keyword-only similarity is never enough
  if (composite < 0.55 && entityRelevance < 0.45 && causalRelevance < 0.45 && goal < 0.5) {
    return {
      allowed: false,
      reason: 'too_sensitive_without_strong_relevance',
      penalty: 0.35,
    };
  }

  return {
    allowed: composite >= 0.55 || causalRelevance >= 0.5 || goal >= 0.55,
    reason:
      composite >= 0.55 || causalRelevance >= 0.5 || goal >= 0.55
        ? 'sensitive_threshold_met'
        : 'too_sensitive',
    penalty: 0.15,
  };
}
