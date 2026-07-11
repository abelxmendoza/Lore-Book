/**
 * Classify preference / goal / identity lifecycle from surface language.
 * Complements preferenceInferenceService — does not invent preferences.
 */

export type LifecycleKind =
  | 'temporary'
  | 'stable'
  | 'habit'
  | 'goal'
  | 'aspiration'
  | 'identity';

export type PreferenceLifecycleHit = {
  subject: string;
  lifecycleKind: LifecycleKind;
  evidence: string;
  confidence: number;
};

type Pat = {
  re: RegExp;
  kind: LifecycleKind;
  conf: number;
  subjectGroup: number;
};

const PATS: Pat[] = [
  // Temporary behavior
  {
    re: /\bI(?:'ve| have) been (?:listening to|watching|into|playing|eating|drinking)\s+([^.!?\n]{2,60})\s+all (?:week|month|day)\b/gi,
    kind: 'temporary',
    conf: 0.9,
    subjectGroup: 1,
  },
  {
    re: /\b(?:this week|lately|recently)\s+I(?:'ve| have)?\s+(?:been )?(?:into|loving|obsessed with)\s+([^.!?\n]{2,60})/gi,
    kind: 'temporary',
    conf: 0.86,
    subjectGroup: 1,
  },
  // Stable preference
  {
    re: /\bI (?:like|love|prefer)\s+([^.!?\n]{2,60})/gi,
    kind: 'stable',
    conf: 0.84,
    subjectGroup: 1,
  },
  {
    re: /\bI(?:'ve| have) always (?:liked|loved|preferred)\s+([^.!?\n]{2,60})/gi,
    kind: 'stable',
    conf: 0.92,
    subjectGroup: 1,
  },
  // Habit
  {
    re: /\bI (?:usually|always|every day|every morning)\s+([^.!?\n]{2,60})/gi,
    kind: 'habit',
    conf: 0.86,
    subjectGroup: 1,
  },
  // Goal
  {
    re: /\bI want to (?:become |be |get |start )?([^.!?\n]{2,60})/gi,
    kind: 'goal',
    conf: 0.88,
    subjectGroup: 1,
  },
  {
    re: /\bmy goal is (?:to )?([^.!?\n]{2,60})/gi,
    kind: 'goal',
    conf: 0.9,
    subjectGroup: 1,
  },
  // Aspiration
  {
    re: /\bI (?:hope|dream|aspire) to ([^.!?\n]{2,60})/gi,
    kind: 'aspiration',
    conf: 0.86,
    subjectGroup: 1,
  },
  // Identity
  {
    re: /\bI am (?:a |an )?([^.!?\n]{2,60})/gi,
    kind: 'identity',
    conf: 0.88,
    subjectGroup: 1,
  },
  {
    re: /\bI(?:'m| am) a ([a-z][\w\s-]{2,40}(?:engineer|developer|artist|musician|teacher|student|founder))\b/gi,
    kind: 'identity',
    conf: 0.92,
    subjectGroup: 1,
  },
];

function clean(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(?:to|the|a|an)\s+/i, '')
    .slice(0, 80);
}

export function extractPreferenceLifecycle(text: string): PreferenceLifecycleHit[] {
  const raw = text?.trim() ?? '';
  if (raw.length < 6) return [];

  const hits: PreferenceLifecycleHit[] = [];
  const seen = new Set<string>();

  for (const p of PATS) {
    const flags = p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`;
    for (const m of raw.matchAll(new RegExp(p.re.source, flags))) {
      const subject = clean(m[p.subjectGroup] || '');
      if (subject.length < 2) continue;
      // Avoid identity false positives on "I am going..."
      if (p.kind === 'identity' && /^(going|trying|just|not|so|really|very)\b/i.test(subject)) {
        continue;
      }
      const evidence = m[0].trim().slice(0, 160);
      const key = `${p.kind}|${subject.toLowerCase()}|${evidence.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        subject,
        lifecycleKind: p.kind,
        evidence,
        confidence: p.conf,
      });
    }
  }

  return hits;
}
