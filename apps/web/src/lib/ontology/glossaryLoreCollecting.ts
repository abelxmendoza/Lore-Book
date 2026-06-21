/**
 * Lore-collecting glossary extension — named skills, extended kinship, employment cues.
 * Imported into glossary.ts (single source of truth). One entry here extends
 * server lexical analysis, client demo detection, and ontology explorer together.
 */

export const LORE_COLLECTING_GLOSSARY_ENTRIES = [
  // ── EXTENDED KINSHIP ───────────────────────────────────────────────────────
  { keyword: 'niece', aliases: ['sobrina'], domain: 'PERSON', category: 'FAMILY', subcategory: 'NIECE', weight: 0.88, confidence: 0.88, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 1, kinshipForm: 'TITLED' },
  { keyword: 'nephew', aliases: ['sobrino'], domain: 'PERSON', category: 'FAMILY', subcategory: 'NEPHEW', weight: 0.88, confidence: 0.88, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 1, kinshipForm: 'TITLED' },
  { keyword: 'grandchild', aliases: ['nieto', 'nieta', 'grandson', 'granddaughter'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GRANDCHILD', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 2, kinshipForm: 'TITLED' },
  { keyword: 'stepmother', aliases: ['stepmom', 'step mom', 'step-mom', 'madrastra'], domain: 'PERSON', category: 'FAMILY', subcategory: 'STEPMOTHER', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1, kinshipForm: 'TITLED' },
  { keyword: 'stepfather', aliases: ['stepdad', 'step dad', 'step-dad', 'padrastro'], domain: 'PERSON', category: 'FAMILY', subcategory: 'STEPFATHER', weight: 0.9, confidence: 0.9, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: -1, kinshipForm: 'TITLED' },
  { keyword: 'stepsibling', aliases: ['stepbrother', 'step sister', 'stepsister', 'step brother', 'step-sister', 'step-sibling'], domain: 'PERSON', category: 'FAMILY', subcategory: 'STEPSIBLING', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, generation: 0, kinshipForm: 'TITLED' },
  { keyword: 'godmother', aliases: ['madrina', 'god mom', 'god-mom'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GODMOTHER', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, kinshipForm: 'TITLED' },
  { keyword: 'godfather', aliases: ['padrino', 'god dad', 'god-dad'], domain: 'PERSON', category: 'FAMILY', subcategory: 'GODFATHER', weight: 0.85, confidence: 0.85, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, kinshipForm: 'TITLED' },
  { keyword: 'in_law', aliases: ['mother-in-law', 'father-in-law', 'sister-in-law', 'brother-in-law', 'in-law', 'in laws'], domain: 'PERSON', category: 'FAMILY', subcategory: 'IN_LAW', weight: 0.88, confidence: 0.88, relationshipHint: 'FAMILY_RELATIONSHIP', titleLeading: true, kinshipForm: 'TITLED' },

  // ── NAMED SKILLS — physical / martial ─────────────────────────────────────
  { keyword: 'muay thai', aliases: ['muay-thai', 'thai boxing'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.92, confidence: 0.9, queryHint: 'SKILL_QUERY' },
  { keyword: 'brazilian jiu jitsu', aliases: ['bjj', 'jiu jitsu', 'jiu-jitsu', 'brazilian jiu-jitsu'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.9, confidence: 0.88, queryHint: 'SKILL_QUERY' },
  { keyword: 'boxing', aliases: ['boxer', 'sparring'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'wrestling', aliases: ['grappling'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'karate', aliases: [], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'judo', aliases: [], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'mma', aliases: ['mixed martial arts'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.88, confidence: 0.85, queryHint: 'SKILL_QUERY' },
  { keyword: 'kickboxing', aliases: [], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'MARTIAL_ART', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'weightlifting', aliases: ['lifting', 'powerlifting', 'strength training'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'FITNESS', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },
  { keyword: 'running', aliases: ['marathon training', 'long distance running', 'jogging'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'FITNESS', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },
  { keyword: 'swimming', aliases: ['swim team'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'FITNESS', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },
  { keyword: 'yoga', aliases: ['pilates'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'FITNESS', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },
  { keyword: 'surfing', aliases: ['surf'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'SPORT', weight: 0.8, confidence: 0.78, queryHint: 'SKILL_QUERY' },
  { keyword: 'skateboarding', aliases: ['skating', 'skate'], domain: 'SKILL', category: 'PHYSICAL', subcategory: 'SPORT', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },

  // ── NAMED SKILLS — technical ───────────────────────────────────────────────
  { keyword: 'ros2', aliases: ['ros 2', 'ros'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'ROBOTICS', weight: 0.9, confidence: 0.88, queryHint: 'SKILL_QUERY' },
  { keyword: 'python', aliases: [], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'PROGRAMMING', weight: 0.88, confidence: 0.85, queryHint: 'SKILL_QUERY' },
  { keyword: 'typescript', aliases: ['ts'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'PROGRAMMING', weight: 0.88, confidence: 0.85, queryHint: 'SKILL_QUERY' },
  { keyword: 'javascript', aliases: ['js'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'PROGRAMMING', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'react', aliases: ['reactjs', 'react.js'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'PROGRAMMING', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'kubernetes', aliases: ['k8s'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'DEVOPS', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'docker', aliases: ['containerization'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'DEVOPS', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },
  { keyword: 'sql', aliases: ['postgres', 'postgresql', 'mysql'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'DATA', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },
  { keyword: 'rust', aliases: [], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'PROGRAMMING', weight: 0.85, confidence: 0.82, queryHint: 'SKILL_QUERY' },
  { keyword: 'cad', aliases: ['solidworks', 'autocad', 'fusion 360'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'ENGINEERING', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },
  { keyword: 'electrical work', aliases: ['electrician', 'wiring'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'TRADE', weight: 0.8, confidence: 0.78, queryHint: 'SKILL_QUERY' },
  { keyword: 'welding', aliases: ['mig welding', 'tig welding'], domain: 'SKILL', category: 'TECHNICAL', subcategory: 'TRADE', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },

  // ── NAMED SKILLS — creative / social ───────────────────────────────────────
  { keyword: 'cooking', aliases: ['baking', 'meal prep'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'CULINARY', weight: 0.8, confidence: 0.78, queryHint: 'SKILL_QUERY' },
  { keyword: 'photography', aliases: ['photo', 'photographer'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'VISUAL', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },
  { keyword: 'guitar', aliases: ['playing guitar'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'MUSIC', weight: 0.8, confidence: 0.78, queryHint: 'SKILL_QUERY' },
  { keyword: 'piano', aliases: ['keys'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'MUSIC', weight: 0.8, confidence: 0.78, queryHint: 'SKILL_QUERY' },
  { keyword: 'djing', aliases: ['dj', 'disc jockey'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'MUSIC', weight: 0.82, confidence: 0.8, queryHint: 'SKILL_QUERY' },
  { keyword: 'writing', aliases: ['creative writing', 'journaling'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'WRITING', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },
  { keyword: 'drawing', aliases: ['illustration', 'sketching'], domain: 'SKILL', category: 'CREATIVE', subcategory: 'VISUAL', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },
  { keyword: 'public speaking', aliases: ['presenting', 'speaking'], domain: 'SKILL', category: 'SOCIAL', subcategory: 'COMMUNICATION', weight: 0.78, confidence: 0.76, queryHint: 'SKILL_QUERY' },
  { keyword: 'negotiation', aliases: ['negotiating'], domain: 'SKILL', category: 'SOCIAL', subcategory: 'COMMUNICATION', weight: 0.76, confidence: 0.74, queryHint: 'SKILL_QUERY' },

  // ── EMPLOYMENT / CAREER cues (hints + org discovery support) ───────────────
  { keyword: 'got hired', aliases: ['got the job', 'landed the job', 'new job', 'started a new job', 'job offer'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'WORK_RELATIONSHIP', queryHint: 'GOAL_QUERY' },
  { keyword: 'internship', aliases: ['interned', 'interning', 'intern at', 'summer intern'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.8, confidence: 0.78, relationshipHint: 'WORK_RELATIONSHIP' },
  { keyword: 'freelance', aliases: ['freelancing', 'contract work', '1099', 'gig work'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.78, confidence: 0.76, relationshipHint: 'WORK_RELATIONSHIP' },
  { keyword: 'laid off', aliases: ['got laid off', 'let go', 'downsized', 'lost my job'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.85, confidence: 0.82, relationshipHint: 'WORK_RELATIONSHIP' },
  { keyword: 'promoted', aliases: ['got promoted', 'promotion', 'raised to'], domain: 'CONCEPT', category: 'RELATIONSHIP_VERB', weight: 0.82, confidence: 0.8, relationshipHint: 'WORK_RELATIONSHIP' },
  { keyword: 'startup', aliases: ['start up', 'early stage company', 'seed stage'], domain: 'ORGANIZATION', category: 'COMPANY', subcategory: 'STARTUP', weight: 0.78, confidence: 0.75 },
  { keyword: 'nonprofit', aliases: ['non-profit', 'ngo', 'charity'], domain: 'ORGANIZATION', category: 'COMPANY', subcategory: 'NONPROFIT', weight: 0.78, confidence: 0.75 },

  // ── GEO / PLACE suffix cues (helps local place-name detection) ─────────────
  { keyword: 'beach', aliases: ['mission beach', 'venice beach', 'huntington beach'], domain: 'LOCATION', category: 'GEOGRAPHY', subcategory: 'BEACH', weight: 0.72, confidence: 0.68, queryHint: 'LOCATION_QUERY' },
  { keyword: 'downtown', aliases: ['city center', 'city centre', 'old town'], domain: 'LOCATION', category: 'GEOGRAPHY', subcategory: 'DISTRICT', weight: 0.72, confidence: 0.68, queryHint: 'LOCATION_QUERY' },
  { keyword: 'neighborhood', aliases: ['neighbourhood', 'barrio', 'my block'], domain: 'LOCATION', category: 'GEOGRAPHY', subcategory: 'DISTRICT', weight: 0.7, confidence: 0.68, queryHint: 'LOCATION_QUERY' },

  // ── JOURNAL / LORE capture cues ────────────────────────────────────────────
  { keyword: 'life update', aliases: ['life updates', 'quick update', 'catch up', 'catch-up'], domain: 'CONCEPT', category: 'RECALL_VERB', weight: 0.75, confidence: 0.72, queryHint: 'MEMORY_QUERY' },
  { keyword: 'add to my story', aliases: ['add this to my story', 'put this in my lore', 'save to lorebook'], domain: 'CONCEPT', category: 'RECALL_VERB', weight: 0.85, confidence: 0.82, queryHint: 'MEMORY_QUERY' },
];
