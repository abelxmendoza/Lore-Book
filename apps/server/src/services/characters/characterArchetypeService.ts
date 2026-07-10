/**
 * Character archetypes — a curated preset list plus automatic inference from
 * the character's own context (kinship, relationship type, role, story text).
 *
 * Auto-assignment never overwrites a user's explicit choice: a manual pick is
 * recorded as metadata.archetype_source = 'user_confirmed' and locks the field.
 */

export type ArchetypePreset = {
  value: string;
  label: string;
  description: string;
};

/** Aligned with the web palette (CharacterProfileCard.getArchetypeColor). */
export const CHARACTER_ARCHETYPE_PRESETS: ArchetypePreset[] = [
  { value: 'friend', label: 'Friend', description: 'A steady presence you choose to spend life with.' },
  { value: 'family', label: 'Family', description: 'Bound by blood, or raised alongside you.' },
  { value: 'romantic', label: 'Romantic', description: 'A love story in your current chapter.' },
  { value: 'crush', label: 'Crush', description: 'Attraction or interest that did not become a relationship.' },
  { value: 'unrequited_crush', label: 'Unrequited Crush', description: 'A one-sided crush, overpursuit, or attraction that did not go well.' },
  { value: 'past_romantic', label: 'Past Flame', description: 'A closed chapter that still shaped you.' },
  { value: 'mentor', label: 'Mentor', description: 'Someone who shapes how you grow.' },
  { value: 'ally', label: 'Ally', description: 'In your corner when it counts.' },
  { value: 'confidant', label: 'Confidant', description: 'Someone trusted with private thoughts, fears, or plans.' },
  { value: 'protector', label: 'Protector', description: 'Someone who shields, defends, or looks out for you.' },
  { value: 'caretaker', label: 'Caretaker', description: 'Someone whose story role centers on care, support, or tending to needs.' },
  { value: 'professional', label: 'Professional', description: 'Connected through work, projects, or practical collaboration.' },
  { value: 'catalyst', label: 'Catalyst', description: 'Someone who triggered a major change, decision, or turning point.' },
  { value: 'rival', label: 'Rival', description: 'Pushes you forward by pushing against you.' },
  { value: 'antagonist', label: 'Antagonist', description: 'A person associated with conflict, harm, opposition, or pressure.' },
  { value: 'estranged', label: 'Estranged', description: 'A once-meaningful connection now marked by distance, fallout, or no contact.' },
  { value: 'muse', label: 'Muse', description: 'Sparks your creative side.' },
  { value: 'community', label: 'Community', description: 'A familiar face from your scenes and circles.' },
  { value: 'public_figure', label: 'Public Figure', description: 'A person known mostly through media, fame, or public presence.' },
  { value: 'acquaintance', label: 'Acquaintance', description: 'On the edge of your story — for now.' },
];

const PRESET_VALUES = new Set(CHARACTER_ARCHETYPE_PRESETS.map((p) => p.value));

export function isPresetArchetype(value: string): boolean {
  return PRESET_VALUES.has(value.toLowerCase().trim());
}

export type ArchetypeInferenceInput = {
  name: string;
  role?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  contextOfMention?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ArchetypeInference = {
  archetype: string;
  confidence: number;
  reason: string;
};

type Rule = {
  archetype: string;
  confidence: number;
  reason: string;
  test: (ctx: { text: string; relationshipType: string; kinship: string }) => boolean;
};

function hasFamilySignal(relationshipType: string, kinship: string): boolean {
  return (
    Boolean(kinship) ||
    /^(family|parent|mother|father|sibling|brother|sister|cousin|aunt|uncle|grand|step)/.test(relationshipType)
  );
}

function hasCrushSignal(text: string, relationshipType: string): boolean {
  return (
    /\b(crush|attracted|attraction|liked her|liked him|liked them|pursu(e|ed|ing)|over[- ]?pursu(e|ed|ing)|one[- ]?sided|unrequited|didn'?t go well|rejected|not interested|thought (she|he|they) (was|were) (older|20|twenty))\b/.test(text) ||
    relationshipType === 'crush' ||
    relationshipType === 'unrequited'
  );
}

// Ordered: strongest structured signals first, story-text patterns after.
const RULES: Rule[] = [
  {
    archetype: 'unrequited_crush',
    confidence: 0.88,
    reason: 'The context points to a one-sided crush or overpursuit rather than family',
    test: ({ text, relationshipType }) =>
      /\b(unrequited|one[- ]?sided|over[- ]?pursu(e|ed|ing)|pursu(e|ed|ing).+(too much|hard|badly)|didn'?t go well|rejected|not interested)\b/.test(text) ||
      relationshipType === 'unrequited',
  },
  {
    archetype: 'crush',
    confidence: 0.82,
    reason: 'The context points to attraction or a crush that did not become a relationship',
    test: ({ text, relationshipType }) =>
      hasCrushSignal(text, relationshipType) && !/\b(girlfriend|boyfriend|partner|wife|husband|dating|dated)\b/.test(text),
  },
  {
    archetype: 'family',
    confidence: 0.95,
    reason: 'Family relationship recorded on this card',
    test: ({ text, relationshipType, kinship }) =>
      hasFamilySignal(relationshipType, kinship) && !hasCrushSignal(text, relationshipType),
  },
  {
    archetype: 'past_romantic',
    confidence: 0.9,
    reason: 'A past relationship shows in their story',
    test: ({ text, relationshipType }) =>
      /\b(ex[- ]?(girlfriend|boyfriend|partner|wife|husband)|my ex\b|broke up|used to date)\b/.test(text) ||
      relationshipType === 'ex' ||
      relationshipType === 'past_romantic',
  },
  {
    archetype: 'romantic',
    confidence: 0.9,
    reason: 'A romantic connection shows in their story',
    test: ({ text, relationshipType }) =>
      /\b(girlfriend|boyfriend|partner|fianc[ée]e?|wife|husband|dating|my love)\b/.test(text) ||
      relationshipType === 'romantic' ||
      relationshipType === 'partner',
  },
  {
    archetype: 'mentor',
    confidence: 0.85,
    reason: 'They guide or teach you',
    test: ({ text, relationshipType }) =>
      /\b(mentor|coach|teacher|professor|sensei|advisor|taught me|guided me|looked up to)\b/.test(text) ||
      relationshipType === 'mentor',
  },
  {
    archetype: 'estranged',
    confidence: 0.82,
    reason: 'Distance, fallout, or no-contact context appears in their story',
    test: ({ text, relationshipType }) =>
      /\b(estranged|no[- ]?contact|blocked|cut (him|her|them) off|not on speaking terms|fell out|fallout|stopped talking)\b/.test(text) ||
      relationshipType === 'estranged',
  },
  {
    archetype: 'antagonist',
    confidence: 0.8,
    reason: 'Conflict, harm, or opposition colors this relationship',
    test: ({ text, relationshipType }) =>
      /\b(antagonist|abusive|bully|betrayed|betrayal|harassed|manipulat(e|ed|ive)|toxic|unsafe|hurt me|threatened)\b/.test(text) ||
      relationshipType === 'antagonist',
  },
  {
    archetype: 'rival',
    confidence: 0.8,
    reason: 'Tension and competition color this relationship',
    test: ({ text, relationshipType }) =>
      /\b(rival|nemesis|competitor|beef|feud|can'?t stand|enemy)\b/.test(text) || relationshipType === 'rival',
  },
  {
    archetype: 'confidant',
    confidence: 0.78,
    reason: 'Trust and private disclosure show in their story',
    test: ({ text, relationshipType }) =>
      /\b(confidant|trusted (him|her|them)|told (him|her|them) everything|open up to|opened up to|safe to talk|kept my secret)\b/.test(text) ||
      relationshipType === 'confidant',
  },
  {
    archetype: 'protector',
    confidence: 0.76,
    reason: 'Protection or defense shows in their story',
    test: ({ text }) => /\b(protected me|defended me|stood up for me|looked out for me|had my back|kept me safe)\b/.test(text),
  },
  {
    archetype: 'caretaker',
    confidence: 0.74,
    reason: 'Caregiving or emotional support shows in their story',
    test: ({ text }) => /\b(took care of me|cared for me|caregiver|checked on me|nursed me|supported me through)\b/.test(text),
  },
  {
    archetype: 'catalyst',
    confidence: 0.72,
    reason: 'They triggered a meaningful change or turning point',
    test: ({ text }) => /\b(changed my life|turning point|wake[- ]?up call|pushed me to|made me realize|because of (him|her|them) i)\b/.test(text),
  },
  {
    archetype: 'professional',
    confidence: 0.75,
    reason: 'You build things or work together',
    test: ({ text }) =>
      /\b(co[- ]?founder|collaborat|built together|bandmate|project together|jam(med)? with)\b/.test(text),
  },
  {
    archetype: 'professional',
    confidence: 0.75,
    reason: 'You share a working world',
    test: ({ text, relationshipType }) =>
      /\b(coworker|co[- ]worker|colleague|work(s|ed)? (with|together)|my (boss|manager|team))\b/.test(text) ||
      relationshipType === 'coworker' ||
      relationshipType === 'colleague',
  },
  {
    archetype: 'muse',
    confidence: 0.7,
    reason: 'They spark your creative side',
    test: ({ text }) => /\b(muse|inspir(es|ed|ing)|artist i admire|their art)\b/.test(text),
  },
  {
    archetype: 'public_figure',
    confidence: 0.7,
    reason: 'They are mostly known through public presence or media',
    test: ({ text, relationshipType }) =>
      /\b(celebrity|public figure|influencer|famous|artist i follow|creator i follow|parasocial)\b/.test(text) ||
      relationshipType === 'public_figure',
  },
  {
    archetype: 'friend',
    confidence: 0.8,
    reason: 'Friendship shows in their story',
    test: ({ text, relationshipType }) =>
      /\b(friend|homie|bestie|best friend|buddy|hang(ing)? out|hung out)\b/.test(text) ||
      relationshipType === 'friend',
  },
  {
    archetype: 'community',
    confidence: 0.6,
    reason: 'You know them from your scenes',
    test: ({ text }) =>
      /\b(scene|show|gig|club|rave|prom|festival|meetup|regular at|from the (gym|studio))\b/.test(text),
  },
];

/**
 * Infer an archetype from the card's own context. Deterministic — structured
 * relationship data wins over story-text patterns, and an unknown context
 * lands on a low-confidence 'acquaintance' rather than a guess.
 */
export function inferCharacterArchetype(input: ArchetypeInferenceInput): ArchetypeInference {
  const meta = input.metadata ?? {};
  const relationshipType = String(meta.relationship_type ?? '').toLowerCase().trim();
  const kinship = String(meta.kinship_label ?? '').toLowerCase().trim();
  const text = [input.role, input.summary, input.contextOfMention, ...(input.tags ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const rule of RULES) {
    if (rule.test({ text, relationshipType, kinship })) {
      return { archetype: rule.archetype, confidence: rule.confidence, reason: rule.reason };
    }
  }

  return {
    archetype: 'acquaintance',
    confidence: 0.3,
    reason: 'Not enough story context yet to tell — will sharpen as you mention them more',
  };
}
