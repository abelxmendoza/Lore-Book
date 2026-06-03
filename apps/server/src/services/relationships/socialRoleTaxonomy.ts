/**
 * Social Role Taxonomy
 *
 * Universal role definitions inferred from natural language.
 * These are autobiographical roles — how a person appears in someone's life story —
 * not corporate directory titles.
 *
 * Core principle: people write "my boss" not "Senior Manager L5".
 * This taxonomy maps natural expressions to structured understanding.
 */

export type SocialDomain =
  | 'family'
  | 'workplace'
  | 'education'
  | 'sports'
  | 'community'
  | 'health'
  | 'creative'
  | 'social'
  | 'spiritual'
  | 'unknown';

export type HierarchyDirection =
  | 'above'    // they have authority/seniority over the user
  | 'below'    // user has authority/seniority over them
  | 'same'     // peers, equals
  | 'lateral'  // related but different branch (siblings, cousins, coworkers in different depts)
  | 'unknown';

export interface RelationshipRole {
  domain: SocialDomain;
  role: string;               // human-readable role name
  hierarchy: HierarchyDirection;
  confidence: number;         // 0–1
  inferred_from?: string;     // the raw text that triggered this
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern dictionary — maps natural language phrases → RelationshipRole
// Each entry: [regex pattern, domain, role, hierarchy]
// ─────────────────────────────────────────────────────────────────────────────

interface RolePattern {
  patterns: RegExp[];
  domain: SocialDomain;
  role: string;
  hierarchy: HierarchyDirection;
  confidence: number;
}

export const ROLE_PATTERNS: RolePattern[] = [
  // ── FAMILY: elders ──────────────────────────────────────────────────────
  { patterns: [/\bmy\s+(?:grand)?mom\b/i, /\bmy\s+mother\b/i, /\bmy\s+mama\b/i, /\bmy\s+mum\b/i], domain: 'family', role: 'parent', hierarchy: 'above', confidence: 0.98 },
  { patterns: [/\bmy\s+(?:grand)?dad\b/i, /\bmy\s+father\b/i, /\bmy\s+papa\b/i, /\bmy\s+pop(?:s)?\b/i], domain: 'family', role: 'parent', hierarchy: 'above', confidence: 0.98 },
  { patterns: [/\bmy\s+grandm(?:a|other|om)\b/i, /\bmy\s+nan(?:a)?\b/i, /\bmy\s+granny\b/i], domain: 'family', role: 'grandparent', hierarchy: 'above', confidence: 0.97 },
  { patterns: [/\bmy\s+grandf(?:a|ather)\b/i, /\bmy\s+grand(?:pa|pop)\b/i, /\bmy\s+gramps\b/i], domain: 'family', role: 'grandparent', hierarchy: 'above', confidence: 0.97 },
  { patterns: [/\bmy\s+(?:great[-\s])?aunt\b/i], domain: 'family', role: 'aunt', hierarchy: 'above', confidence: 0.95 },
  { patterns: [/\bmy\s+(?:great[-\s])?uncle\b/i], domain: 'family', role: 'uncle', hierarchy: 'above', confidence: 0.95 },
  { patterns: [/\bmy\s+parent(?:s)?\b/i], domain: 'family', role: 'parent', hierarchy: 'above', confidence: 0.97 },
  { patterns: [/\bmy\s+in[-\s]?law(?:s)?\b/i, /\bmy\s+mother[-\s]in[-\s]law\b/i, /\bmy\s+father[-\s]in[-\s]law\b/i], domain: 'family', role: 'in_law', hierarchy: 'above', confidence: 0.92 },

  // ── FAMILY: same generation ──────────────────────────────────────────────
  { patterns: [/\bmy\s+(?:older\s+|younger\s+|half\s+|step\s+)?(?:bro(?:ther)?|sis(?:ter)?|sibling)\b/i], domain: 'family', role: 'sibling', hierarchy: 'lateral', confidence: 0.96 },
  { patterns: [/\bmy\s+cousin\b/i], domain: 'family', role: 'cousin', hierarchy: 'lateral', confidence: 0.96 },
  { patterns: [/\bmy\s+(?:husband|wife|spouse|partner|fianc[eé](?:e)?)\b/i], domain: 'family', role: 'spouse', hierarchy: 'same', confidence: 0.97 },
  { patterns: [/\bmy\s+(?:twin|fraternal\s+twin|identical\s+twin)\b/i], domain: 'family', role: 'twin', hierarchy: 'lateral', confidence: 0.97 },

  // ── FAMILY: younger generation ───────────────────────────────────────────
  { patterns: [/\bmy\s+(?:step\s+)?(?:son|daughter|child|kid)\b/i], domain: 'family', role: 'child', hierarchy: 'below', confidence: 0.97 },
  { patterns: [/\bmy\s+niece\b/i, /\bmy\s+nephew\b/i], domain: 'family', role: 'niece_nephew', hierarchy: 'below', confidence: 0.95 },
  { patterns: [/\bmy\s+grandchild\b/i, /\bmy\s+grandson\b/i, /\bmy\s+granddaughter\b/i], domain: 'family', role: 'grandchild', hierarchy: 'below', confidence: 0.96 },

  // ── WORKPLACE: authority ─────────────────────────────────────────────────
  { patterns: [/\bmy\s+boss\b/i, /\bmy\s+manager\b/i, /\bmy\s+supervisor\b/i, /\bmy\s+director\b/i, /\bmy\s+lead\b/i], domain: 'workplace', role: 'supervisor', hierarchy: 'above', confidence: 0.94 },
  { patterns: [/\bmy\s+(?:company\s+)?founder\b/i, /\bmy\s+ceo\b/i, /\bmy\s+cto\b/i, /\bmy\s+coo\b/i, /\bmy\s+executive\b/i], domain: 'workplace', role: 'executive', hierarchy: 'above', confidence: 0.92 },
  { patterns: [/\bmy\s+(?:executive\s+)?assistant\b/i, /\bmy\s+admin\b/i], domain: 'workplace', role: 'direct_report', hierarchy: 'below', confidence: 0.88 },
  { patterns: [/\bmy\s+(?:direct\s+)?report\b/i, /\bmy\s+(?:team\s+)?member\b/i, /\bmy\s+employee\b/i], domain: 'workplace', role: 'direct_report', hierarchy: 'below', confidence: 0.91 },
  { patterns: [/\bmy\s+coworker\b/i, /\bmy\s+colleague\b/i, /\bmy\s+teammate\b/i, /\bmy\s+work(?:\s+)?(?:friend|buddy|mate)\b/i], domain: 'workplace', role: 'peer', hierarchy: 'same', confidence: 0.92 },
  { patterns: [/\bmy\s+client\b/i, /\bmy\s+customer\b/i], domain: 'workplace', role: 'client', hierarchy: 'lateral', confidence: 0.89 },
  { patterns: [/\bmy\s+recruiter\b/i, /\bmy\s+hr\b/i, /\bmy\s+headhunter\b/i], domain: 'workplace', role: 'recruiter', hierarchy: 'lateral', confidence: 0.87 },
  { patterns: [/\bmy\s+intern\b/i, /\bmy\s+apprentice\b/i], domain: 'workplace', role: 'direct_report', hierarchy: 'below', confidence: 0.90 },
  { patterns: [/\bmy\s+business\s+partner\b/i, /\bmy\s+co[-\s]founder\b/i], domain: 'workplace', role: 'co_founder', hierarchy: 'same', confidence: 0.93 },
  { patterns: [/\bmy\s+mentor\b/i, /\bmy\s+advisor\b/i, /\bmy\s+consultant\b/i], domain: 'workplace', role: 'mentor', hierarchy: 'above', confidence: 0.90 },

  // ── EDUCATION: authority ─────────────────────────────────────────────────
  { patterns: [/\bmy\s+professor\b/i, /\bmy\s+prof\b/i], domain: 'education', role: 'professor', hierarchy: 'above', confidence: 0.96 },
  { patterns: [/\bmy\s+teacher\b/i, /\bmy\s+instructor\b/i, /\bmy\s+tutor\b/i], domain: 'education', role: 'teacher', hierarchy: 'above', confidence: 0.94 },
  { patterns: [/\bmy\s+academic\s+(?:advisor|supervisor)\b/i, /\bmy\s+thesis\s+advisor\b/i, /\bmy\s+phd\s+advisor\b/i], domain: 'education', role: 'academic_advisor', hierarchy: 'above', confidence: 0.95 },
  { patterns: [/\bmy\s+(?:class)?mate\b/i, /\bmy\s+schoolmate\b/i, /\bmy\s+study\s+(?:partner|buddy|group)\b/i], domain: 'education', role: 'classmate', hierarchy: 'same', confidence: 0.91 },
  { patterns: [/\bmy\s+student\b/i, /\bmy\s+pupil\b/i, /\bmy\s+mentee\b/i], domain: 'education', role: 'student', hierarchy: 'below', confidence: 0.93 },

  // ── SPORTS / MARTIAL ARTS ───────────────────────────────────────────────
  { patterns: [/\bmy\s+coach\b/i, /\bmy\s+trainer\b/i, /\bmy\s+sensei\b/i, /\bmy\s+sifu\b/i, /\bmy\s+master\b/i], domain: 'sports', role: 'coach', hierarchy: 'above', confidence: 0.95 },
  { patterns: [/\bmy\s+(?:training\s+)?partner\b/i, /\bmy\s+sparring\s+partner\b/i, /\bmy\s+gym\s+(?:buddy|partner|mate)\b/i], domain: 'sports', role: 'training_partner', hierarchy: 'same', confidence: 0.90 },
  { patterns: [/\bmy\s+(?:martial\s+arts\s+)?student\b/i, /\bmy\s+(?:bjj|judo|karate|mma)\s+student\b/i], domain: 'sports', role: 'student', hierarchy: 'below', confidence: 0.91 },
  { patterns: [/\bmy\s+(?:team)?mate\b/i, /\bmy\s+(?:sports\s+)?teammate\b/i], domain: 'sports', role: 'teammate', hierarchy: 'same', confidence: 0.91 },
  { patterns: [/\bmy\s+(?:personal\s+)?trainer\b/i], domain: 'sports', role: 'personal_trainer', hierarchy: 'above', confidence: 0.93 },

  // ── COMMUNITY ───────────────────────────────────────────────────────────
  { patterns: [/\bmy\s+(?:community\s+|group\s+)?organizer\b/i, /\bmy\s+(?:club\s+)?president\b/i, /\bmy\s+chapter\s+leader\b/i], domain: 'community', role: 'leader', hierarchy: 'above', confidence: 0.89 },
  { patterns: [/\bmy\s+volunteer\b/i, /\bmy\s+(?:community\s+)?member\b/i], domain: 'community', role: 'member', hierarchy: 'same', confidence: 0.82 },
  { patterns: [/\bmy\s+(?:life\s+|executive\s+|business\s+)?coach\b/i], domain: 'community', role: 'life_coach', hierarchy: 'above', confidence: 0.91 },
  { patterns: [/\bmy\s+therapist\b/i, /\bmy\s+(?:psycho)?analyst\b/i, /\bmy\s+counselor\b/i], domain: 'health', role: 'therapist', hierarchy: 'lateral', confidence: 0.96 },
  { patterns: [/\bmy\s+(?:primary\s+|family\s+)?doctor\b/i, /\bmy\s+physician\b/i, /\bmy\s+gp\b/i], domain: 'health', role: 'doctor', hierarchy: 'lateral', confidence: 0.95 },

  // ── CREATIVE ───────────────────────────────────────────────────────────
  { patterns: [/\bmy\s+collaborator\b/i, /\bmy\s+creative\s+partner\b/i, /\bmy\s+co[-\s]writer\b/i, /\bmy\s+co[-\s]producer\b/i], domain: 'creative', role: 'collaborator', hierarchy: 'same', confidence: 0.90 },
  { patterns: [/\bmy\s+editor\b/i, /\bmy\s+(?:writing\s+)?mentor\b/i], domain: 'creative', role: 'creative_mentor', hierarchy: 'above', confidence: 0.88 },

  // ── SOCIAL ─────────────────────────────────────────────────────────────
  { patterns: [/\bmy\s+best\s+friend\b/i, /\bmy\s+bff\b/i], domain: 'social', role: 'best_friend', hierarchy: 'same', confidence: 0.95 },
  { patterns: [/\bmy\s+friend\b/i, /\bmy\s+buddy\b/i, /\bmy\s+pal\b/i, /\bmy\s+mate\b/i], domain: 'social', role: 'friend', hierarchy: 'same', confidence: 0.90 },
  { patterns: [/\bmy\s+(?:ex[-\s])?(?:boyfriend|girlfriend|partner)\b/i, /\bmy\s+(?:significant\s+other|so\b)/i], domain: 'social', role: 'romantic_partner', hierarchy: 'same', confidence: 0.95 },
  { patterns: [/\bmy\s+neighbor\b/i, /\bmy\s+roommate\b/i, /\bmy\s+housemate\b/i, /\bmy\s+flatmate\b/i], domain: 'social', role: 'neighbor', hierarchy: 'same', confidence: 0.91 },
  { patterns: [/\bmy\s+acquaintance\b/i, /\bsomeone\s+I\s+know\b/i], domain: 'social', role: 'acquaintance', hierarchy: 'same', confidence: 0.80 },
];
