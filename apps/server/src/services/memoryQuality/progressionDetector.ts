/**
 * Life progression / stage signals — deterministic, evidence-backed.
 */

export type ProgressionKind =
  | 'beginner'
  | 'learning'
  | 'competent'
  | 'expert'
  | 'career_transition'
  | 'relationship_transition'
  | 'moving'
  | 'identity_shift'
  | 'new_routine'
  | 'habit_formation'
  | 'confidence_increase'
  | 'confidence_decrease';

export type ProgressionHit = {
  kind: ProgressionKind;
  label: string;
  evidence: string;
  confidence: number;
  domain?: string;
};

type Pat = { re: RegExp; kind: ProgressionKind; conf: number; domain?: string };

const PATS: Pat[] = [
  { re: /\bI(?:'m| am) (?:just )?starting (?:to |out )?(?:learn |with |in )?([^.!?\n]{2,60})/gi, kind: 'beginner', conf: 0.86 },
  { re: /\bI(?:'m| am) a beginner (?:at |in )?([^.!?\n]{2,40})/gi, kind: 'beginner', conf: 0.9 },
  { re: /\bI used to be a beginner (?:at |in )?([^.!?\n]{2,40})/gi, kind: 'beginner', conf: 0.9 },
  { re: /\b(?:was|were) a beginner (?:at |in )?([^.!?\n]{2,40})/gi, kind: 'beginner', conf: 0.86 },
  { re: /\bI(?:'m| am) learning ([^.!?\n]{2,60})/gi, kind: 'learning', conf: 0.88 },
  { re: /\bI(?:'ve| have) been (?:learning|practicing) ([^.!?\n]{2,60})/gi, kind: 'learning', conf: 0.84 },
  { re: /\bI(?:'m| am) getting (?:pretty |quite )?(?:good|better) at ([^.!?\n]{2,60})/gi, kind: 'competent', conf: 0.86 },
  { re: /\bI(?:'m| am) (?:comfortable|competent) (?:with |at )?([^.!?\n]{2,60})/gi, kind: 'competent', conf: 0.84 },
  { re: /\bI(?:'m| am) (?:an? )?expert (?:at |in )?([^.!?\n]{2,60})/gi, kind: 'expert', conf: 0.88 },
  { re: /\bI(?:'ve| have) mastered ([^.!?\n]{2,60})/gi, kind: 'expert', conf: 0.86 },
  { re: /\b(?:new job|switched jobs|career change|changing careers|left my job|started at)\b[^.!?\n]{0,80}/gi, kind: 'career_transition', conf: 0.88, domain: 'career' },
  { re: /\b(?:broke up|break ?up|got together|started dating|got engaged|got married|divorced)\b[^.!?\n]{0,80}/gi, kind: 'relationship_transition', conf: 0.88, domain: 'relationship' },
  { re: /\b(?:moved to|moving to|relocated|relocation|new apartment|new place in)\b[^.!?\n]{0,80}/gi, kind: 'moving', conf: 0.9, domain: 'place' },
  { re: /\bI(?:'m| am) (?:becoming|not the same|different now|growing into)\b[^.!?\n]{0,80}/gi, kind: 'identity_shift', conf: 0.82 },
  { re: /\b(?:every (?:morning|day|night)|daily routine|new habit|started (?:a )?habit)\b[^.!?\n]{0,80}/gi, kind: 'new_routine', conf: 0.84 },
  { re: /\bI(?:'ve| have) been (?:consistently |regularly )?([a-z]+ing)\b[^.!?\n]{0,40}/gi, kind: 'habit_formation', conf: 0.78 },
  { re: /\bI(?:'m| am) (?:more |feeling )?confident\b[^.!?\n]{0,60}/gi, kind: 'confidence_increase', conf: 0.86 },
  { re: /\b(?:lost confidence|less confident|doubt myself|imposter)\b[^.!?\n]{0,60}/gi, kind: 'confidence_decrease', conf: 0.86 },
];

export function extractProgression(text: string): ProgressionHit[] {
  const raw = text?.trim() ?? '';
  if (raw.length < 6) return [];

  const hits: ProgressionHit[] = [];
  const seen = new Set<string>();

  for (const p of PATS) {
    const flags = p.re.flags.includes('g') ? p.re.flags : `${p.re.flags}g`;
    for (const m of raw.matchAll(new RegExp(p.re.source, flags))) {
      const evidence = m[0].trim().slice(0, 160);
      const label = (m[1] || evidence).trim().slice(0, 100);
      const key = `${p.kind}|${evidence.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        kind: p.kind,
        label,
        evidence,
        confidence: p.conf,
        domain: p.domain,
      });
    }
  }

  return hits;
}
