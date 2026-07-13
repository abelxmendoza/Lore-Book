/**
 * Character Info tab — priority-ordered profile overview.
 */

import { shortDisplayName } from '../../lib/displayName';
import {
  Clock,
  Heart,
  Info,
  MapPin,
  Smile,
  Sparkles,
  Star,
  Briefcase,
  User,
  Users,
  Save,
  Wand2,
  Loader2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/badge';
import { UnknownField } from '../ui/UnknownField';
import { toFieldSource } from '../common/FieldSourceBadge';
import { EditableField, type EditableFieldOption } from '../common/EditableField';
import { useUpdateCharacterMutation } from '../../store/api/entitiesApi';
import { fetchJson } from '../../lib/api';
import type { Character } from './CharacterProfileCard';
import { RelationshipFlagsPanel } from '../love/RelationshipFlagsPanel';
import { RelationshipLifeImpactPanel } from '../love/RelationshipLifeImpactPanel';
import { CharacterLoreProfileSection } from './CharacterLoreProfileSection';
import type { CharacterLoreProfile } from '../../api/characterLoreProfile';
import { resolveMockRelationshipInfluence } from '../../mocks/romanticLifeImpact';
import { suggestDisplayTitleFromNames, getCharacterDisplayTitle } from '../../lib/characterDisplayTitle';

type Relationship = {
  id?: string;
  character_id?: string;
  character_name?: string;
  relationship_type: string;
  status?: string;
  summary?: string;
  closeness_score?: number;
  is_situationship?: boolean;
  exclusivity_status?: string;
  compatibility_score?: number;
  relationship_health?: number;
  affection_score?: number;
  emotional_intensity?: number;
  is_current?: boolean;
  start_date?: string;
  pros?: string[];
  cons?: string[];
  red_flags?: string[];
  green_flags?: string[];
  metadata?: Record<string, unknown>;
};

type CharacterAttribute = {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  evidence?: string;
};

type LifeMapItem = { label: string; value?: string; prompt: string };

const SEX_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'nonbinary', label: 'Nonbinary' },
];

const ORIENTATION_OPTIONS = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbian' },
  { value: 'bisexual', label: 'Bisexual' },
  { value: 'heterosexual', label: 'Heterosexual' },
  { value: 'queer', label: 'Queer' },
];

type ArchetypePreset = {
  value: string;
  label: string;
  description: string;
};

const FALLBACK_ARCHETYPE_PRESETS: ArchetypePreset[] = [
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

// Roles are FACTUAL context (what they are/were in real life). Story categories
// like friend/mentor/rival live in the archetype presets — don't duplicate them here.
const ROLE_PRESETS: EditableFieldOption[] = [
  { value: '', label: 'No role yet' },
  { value: 'student', label: 'Student' },
  { value: 'college student', label: 'College student' },
  { value: 'high school student', label: 'High school student' },
  { value: 'musician', label: 'Musician' },
  { value: 'dj', label: 'DJ' },
  { value: 'artist', label: 'Artist' },
  { value: 'designer', label: 'Designer' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'videographer', label: 'Videographer' },
  { value: 'dancer', label: 'Dancer' },
  { value: 'performer', label: 'Performer' },
  { value: 'promoter', label: 'Promoter' },
  { value: 'venue staff', label: 'Venue staff' },
  { value: 'security', label: 'Security' },
  { value: 'bartender', label: 'Bartender' },
  { value: 'barista', label: 'Barista' },
  { value: 'server', label: 'Server' },
  { value: 'customer', label: 'Customer' },
  { value: 'client', label: 'Client' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'manager', label: 'Manager' },
  { value: 'founder', label: 'Founder' },
  { value: 'business owner', label: 'Business owner' },
  { value: 'engineer', label: 'Engineer' },
  { value: 'developer', label: 'Developer' },
  { value: 'technician', label: 'Technician' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'therapist', label: 'Therapist' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'coach', label: 'Coach' },
  { value: 'entrepreneur', label: 'Entrepreneur' },
  { value: 'content creator', label: 'Content creator' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'military', label: 'Military' },
  { value: 'classmate', label: 'Classmate' },
  { value: 'roommate', label: 'Roommate' },
  { value: 'neighbor', label: 'Neighbor' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'retired', label: 'Retired' },
];

const normalizeArchetype = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '_');
const MAX_CHARACTER_ARCHETYPES = 3;
const MAX_CHARACTER_ROLES = 3;

const splitMultiField = (value?: string | null): string[] => {
  const seen = new Set<string>();
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase().replace(/\s+/g, ' ');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const joinMultiField = (values: string[], max: number) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase().replace(/\s+/g, ' ');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max)
    .join(', ');
};

const normalizeArchetypeList = (value: string) =>
  joinMultiField(splitMultiField(value).map(normalizeArchetype), MAX_CHARACTER_ARCHETYPES);

const normalizeRoleList = (value: string) =>
  joinMultiField(splitMultiField(value).map((role) => role.toLowerCase().replace(/\s+/g, ' ')), MAX_CHARACTER_ROLES);

function inferArchetypeFromLocalContext(input: {
  role?: string;
  summary?: string;
  tags?: string[];
  relationshipType?: string;
  kinship?: string;
}): { archetype: string; reason: string } {
  const relationshipType = normalizeArchetype(input.relationshipType ?? '');
  const kinship = normalizeArchetype(input.kinship ?? '');
  const text = [input.role, input.summary, ...(input.tags ?? [])].filter(Boolean).join(' ').toLowerCase();
  const hasCrushSignal =
    /\b(crush|attracted|attraction|liked her|liked him|liked them|pursu(e|ed|ing)|over[- ]?pursu(e|ed|ing)|one[- ]?sided|unrequited|didn'?t go well|rejected|not interested|thought (she|he|they) (was|were) (older|20|twenty))\b/.test(text) ||
    relationshipType === 'crush' ||
    relationshipType === 'unrequited';

  if (
    /\b(unrequited|one[- ]?sided|over[- ]?pursu(e|ed|ing)|pursu(e|ed|ing).+(too much|hard|badly)|didn'?t go well|rejected|not interested)\b/.test(text) ||
    relationshipType === 'unrequited'
  ) {
    return { archetype: 'unrequited_crush', reason: 'The context points to a one-sided crush or overpursuit rather than family.' };
  }
  if (hasCrushSignal && !/\b(girlfriend|boyfriend|partner|wife|husband|dating|dated)\b/.test(text)) {
    return { archetype: 'crush', reason: 'The context points to attraction or a crush that did not become a relationship.' };
  }
  if ((kinship || /^(family|parent|mother|father|sibling|brother|sister|cousin|aunt|uncle|grand|step)/.test(relationshipType)) && !hasCrushSignal) {
    return { archetype: 'family', reason: 'Family or kinship context is already on this card.' };
  }
  if (/\b(ex[- ]?(girlfriend|boyfriend|partner|wife|husband)|my ex\b|broke up|used to date)\b/.test(text) || relationshipType === 'past_romantic') {
    return { archetype: 'past_romantic', reason: 'Past romantic context appears in the character details.' };
  }
  if (/\b(girlfriend|boyfriend|partner|fianc[ée]e?|wife|husband|dating)\b/.test(text) || relationshipType === 'romantic') {
    return { archetype: 'romantic', reason: 'Romantic context appears in the character details.' };
  }
  if (/\b(mentor|coach|teacher|professor|advisor|taught me|guided me)\b/.test(text) || relationshipType === 'mentor') {
    return { archetype: 'mentor', reason: 'Guidance or teaching context appears in the character details.' };
  }
  if (/\b(estranged|no[- ]?contact|blocked|cut (him|her|them) off|not on speaking terms|fell out|fallout|stopped talking)\b/.test(text) || relationshipType === 'estranged') {
    return { archetype: 'estranged', reason: 'Distance, fallout, or no-contact context appears in their story.' };
  }
  if (/\b(antagonist|abusive|bully|betrayed|betrayal|harassed|manipulat(e|ed|ive)|toxic|unsafe|hurt me|threatened)\b/.test(text) || relationshipType === 'antagonist') {
    return { archetype: 'antagonist', reason: 'Conflict, harm, or opposition colors this relationship.' };
  }
  if (/\b(coworker|co[- ]worker|colleague|boss|manager|team)\b/.test(text) || relationshipType === 'colleague') {
    return { archetype: 'professional', reason: 'Work context appears in the character details.' };
  }
  if (/\b(collaborat|built together|bandmate|project together)\b/.test(text)) {
    return { archetype: 'professional', reason: 'Collaboration context appears in the character details.' };
  }
  if (/\b(rival|competitor|enemy|feud)\b/.test(text) || relationshipType === 'rival') {
    return { archetype: 'rival', reason: 'Competitive context appears in the character details.' };
  }
  if (/\b(confidant|trusted (him|her|them)|told (him|her|them) everything|open up to|opened up to|safe to talk|kept my secret)\b/.test(text) || relationshipType === 'confidant') {
    return { archetype: 'confidant', reason: 'Trust and private disclosure show in their story.' };
  }
  if (/\b(protected me|defended me|stood up for me|looked out for me|had my back|kept me safe)\b/.test(text)) {
    return { archetype: 'protector', reason: 'Protection or defense shows in their story.' };
  }
  if (/\b(took care of me|cared for me|caregiver|checked on me|nursed me|supported me through)\b/.test(text)) {
    return { archetype: 'caretaker', reason: 'Caregiving or emotional support shows in their story.' };
  }
  if (/\b(changed my life|turning point|wake[- ]?up call|pushed me to|made me realize|because of (him|her|them) i)\b/.test(text)) {
    return { archetype: 'catalyst', reason: 'They triggered a meaningful change or turning point.' };
  }
  if (/\b(friend|homie|bestie|buddy|hung out|hang out)\b/.test(text) || relationshipType === 'friend') {
    return { archetype: 'friend', reason: 'Friendship context appears in the character details.' };
  }
  if (/\b(scene|show|gig|club|festival|meetup|regular at)\b/.test(text)) {
    return { archetype: 'community', reason: 'Community or scene context appears in the character details.' };
  }
  if (/\b(celebrity|public figure|influencer|famous|artist i follow|creator i follow|parasocial)\b/.test(text) || relationshipType === 'public_figure') {
    return { archetype: 'public_figure', reason: 'They are mostly known through public presence or media.' };
  }
  return { archetype: 'acquaintance', reason: 'There is not enough specific context yet, so this starts broad.' };
}

function inferRoleFromLocalContext(input: {
  role?: string;
  summary?: string;
  tags?: string[];
  relationshipType?: string;
  kinship?: string;
}): { role: string; reason: string } {
  const relationshipType = normalizeArchetype(input.relationshipType ?? '');
  const kinship = normalizeArchetype(input.kinship ?? '');
  const text = [input.role, input.summary, ...(input.tags ?? [])].filter(Boolean).join(' ').toLowerCase();

  if (/\b(high school|senior in high school|still in school)\b/.test(text)) {
    return { role: 'high school student', reason: 'The context says they were in high school.' };
  }
  if (/\b(classmate|same class|in my class)\b/.test(text)) {
    return { role: 'classmate', reason: 'Classmate context appears in the character details.' };
  }
  if (/\b(college|university|student)\b/.test(text)) {
    return { role: 'student', reason: 'Student context appears in the character details.' };
  }
  if (/\b(roommate|housemate|lived with)\b/.test(text)) {
    return { role: 'roommate', reason: 'Roommate context appears in the character details.' };
  }
  if (/\b(neighbor|next door|lived nearby)\b/.test(text)) {
    return { role: 'neighbor', reason: 'Neighbor context appears in the character details.' };
  }
  if (/\b(dj|deejay)\b/.test(text)) {
    return { role: 'dj', reason: 'DJ context appears in the character details.' };
  }
  if (/\b(band|singer|guitar|drummer|music|musician)\b/.test(text)) {
    return { role: 'musician', reason: 'Music or performance context appears in the character details.' };
  }
  if (/\b(performer|performed|stage|show)\b/.test(text)) {
    return { role: 'performer', reason: 'Performance context appears in the character details.' };
  }
  if (/\b(security|bouncer|door person)\b/.test(text)) {
    return { role: 'security', reason: 'Security or door-staff context appears in the character details.' };
  }
  if (/\b(bartender)\b/.test(text)) {
    return { role: 'bartender', reason: 'Bartender context appears in the character details.' };
  }
  if (/\b(barista)\b/.test(text)) {
    return { role: 'barista', reason: 'Barista context appears in the character details.' };
  }
  if (/\b(server|waiter|waitress)\b/.test(text)) {
    return { role: 'server', reason: 'Server context appears in the character details.' };
  }
  if (/\b(host|venue staff)\b/.test(text)) {
    return { role: 'venue staff', reason: 'Venue-staff context appears in the character details.' };
  }
  if (/\b(photographer|photo shoot)\b/.test(text)) {
    return { role: 'photographer', reason: 'Photography context appears in the character details.' };
  }
  if (/\b(videographer|video shoot|filmed)\b/.test(text)) {
    return { role: 'videographer', reason: 'Video-production context appears in the character details.' };
  }
  if (/\b(designer|graphic design|fashion design)\b/.test(text)) {
    return { role: 'designer', reason: 'Design context appears in the character details.' };
  }
  if (/\b(artist|art|gallery|studio)\b/.test(text)) {
    return { role: 'artist', reason: 'Art or creative-work context appears in the character details.' };
  }
  if (/\b(coworker|co[- ]worker|colleague|worked with|work together)\b/.test(text) || relationshipType === 'coworker') {
    return { role: 'coworker', reason: 'Workplace peer context appears in the character details.' };
  }
  if (/\b(boss|manager|supervisor)\b/.test(text)) {
    return { role: 'manager', reason: 'Manager or supervisor context appears in the character details.' };
  }
  if (/\b(founder|co[- ]?founder)\b/.test(text)) {
    return { role: 'founder', reason: 'Founder context appears in the character details.' };
  }
  if (/\b(business owner|owns? (a|the) business|shop owner|venue owner)\b/.test(text)) {
    return { role: 'business owner', reason: 'Business-owner context appears in the character details.' };
  }
  if (/\b(developer|programmer|software)\b/.test(text)) {
    return { role: 'developer', reason: 'Software/developer context appears in the character details.' };
  }
  if (/\b(engineer)\b/.test(text)) {
    return { role: 'engineer', reason: 'Engineering context appears in the character details.' };
  }
  if (/\b(technician|tech)\b/.test(text)) {
    return { role: 'technician', reason: 'Technician context appears in the character details.' };
  }
  if (/\b(doctor|physician)\b/.test(text)) {
    return { role: 'doctor', reason: 'Medical doctor context appears in the character details.' };
  }
  if (/\b(nurse)\b/.test(text)) {
    return { role: 'nurse', reason: 'Nursing context appears in the character details.' };
  }
  if (/\b(therapist|counselor)\b/.test(text)) {
    return { role: 'therapist', reason: 'Therapist or counselor context appears in the character details.' };
  }
  if (/\b(lawyer|attorney)\b/.test(text)) {
    return { role: 'lawyer', reason: 'Legal role context appears in the character details.' };
  }
  if (/\b(coach)\b/.test(text)) {
    return { role: 'coach', reason: 'Coach context appears in the character details.' };
  }
  if (/\b(teacher|professor|mentor)\b/.test(text) || relationshipType === 'mentor') {
    return { role: 'teacher', reason: 'Teaching or guidance context appears in the character details.' };
  }
  if (/\b(client)\b/.test(text)) {
    return { role: 'client', reason: 'Client context appears in the character details.' };
  }
  if (/\b(customer)\b/.test(text)) {
    return { role: 'customer', reason: 'Customer context appears in the character details.' };
  }
  if (/\b(landlord)\b/.test(text)) {
    return { role: 'landlord', reason: 'Landlord context appears in the character details.' };
  }
  if (/\b(tenant)\b/.test(text)) {
    return { role: 'tenant', reason: 'Tenant context appears in the character details.' };
  }
  if (/\b(influencer)\b/.test(text)) {
    return { role: 'influencer', reason: 'Influencer context appears in the character details.' };
  }
  if (/\b(content creator|youtuber|streamer|tiktoker)\b/.test(text)) {
    return { role: 'content creator', reason: 'Content-creator context appears in the character details.' };
  }
  if (/\b(military|soldier|marine|air force|navy|army|veteran)\b/.test(text)) {
    return { role: 'military', reason: 'Military context appears in the character details.' };
  }
  if (/\b(retired|retiree)\b/.test(text)) {
    return { role: 'retired', reason: 'Retirement context appears in the character details.' };
  }
  return { role: '', reason: 'There is not enough factual role context yet. Relationship labels belong under Archetype.' };
}

export type CharacterInfoPanelProps = {
  editedCharacter: Character;
  setEditedCharacter: React.Dispatch<React.SetStateAction<Character>>;
  characterId: string;
  onUpdate: () => void;
  relationship?: Relationship;
  dynamics: { health?: { health_score?: number; trends?: { health_trend?: string } }; lifecycle?: { current_stage?: string } } | null;
  askInChat: (prompt: string) => void;
  relationshipStatus?: string;
  romanticConnections: Relationship[];
  strongestConnections: Relationship[];
  lifeMap: LifeMapItem[];
  occupations: string[];
  workplaces: string[];
  sideHustles: string[];
  behaviorAttributes: CharacterAttribute[];
  socialStanding?: { tier?: string; score?: number };
  characterAttributes: CharacterAttribute[];
  loadingAttributes: boolean;
  provenance: { mentionCount?: number; firstMentionedAt?: string; lastMentionedAt?: string; sourceUtterances?: { content: string; created_at: string }[] } | null;
  isMockDataEnabled: boolean;
  openCharacterByRelationship: (rel: Relationship) => void;
  loreProfile?: CharacterLoreProfile | null;
  loreProfileLoading?: boolean;
  onOpenCharacterById?: (characterId: string) => void;
  onAddWorldPerson?: (targetCharacterId: string, relationshipType: string, status: string) => Promise<void>;
  onUpdateWorldPerson?: (relationshipId: string, patch: { relationship_type?: string; status?: string }) => Promise<void>;
  onDeleteWorldPerson?: (relationshipId: string) => Promise<void>;
};

function StatCell({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-white/35 truncate">{label}</p>
      <p className="text-sm font-semibold text-white mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[10px] text-white/40 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function parseAliases(raw: string, primaryName: string): string[] {
  const primaryKey = primaryName.trim().toLowerCase();
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const alias = part.replace(/\s+/g, ' ').trim();
    const key = alias.toLowerCase();
    if (!alias || key === primaryKey || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

function inferNameParts(character: Character): { firstName: string; middleName: string; lastName: string } {
  const meta = (character.metadata ?? {}) as Record<string, unknown>;
  const explicitMiddle = typeof meta.middle_name === 'string' ? meta.middle_name : character.middle_name;
  const firstName = character.first_name ?? '';
  const lastName = character.last_name ?? '';
  if (firstName || explicitMiddle || lastName) {
    const lastParts = lastName.trim().split(/\s+/).filter(Boolean);
    return {
      firstName,
      middleName: explicitMiddle ?? (lastParts.length > 1 ? lastParts.slice(0, -1).join(' ') : ''),
      lastName: explicitMiddle ? lastName : (lastParts.length > 1 ? lastParts[lastParts.length - 1] : lastName),
    };
  }

  const parts = character.name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  };
}

export function CharacterInfoPanel({
  editedCharacter,
  setEditedCharacter,
  characterId,
  onUpdate,
  relationship,
  dynamics,
  askInChat,
  relationshipStatus,
  romanticConnections,
  strongestConnections,
  lifeMap,
  occupations,
  workplaces,
  sideHustles,
  behaviorAttributes,
  socialStanding,
  characterAttributes,
  loadingAttributes,
  provenance,
  isMockDataEnabled,
  openCharacterByRelationship,
  loreProfile,
  loreProfileLoading = false,
  onOpenCharacterById,
  onAddWorldPerson,
  onUpdateWorldPerson,
  onDeleteWorldPerson,
}: CharacterInfoPanelProps) {
  const [updateCharacter] = useUpdateCharacterMutation();
  const meta = (editedCharacter.metadata ?? {}) as Record<string, unknown>;
  const standingOverride = (meta.standing_override as { tier?: string } | null)?.tier ?? null;
  const impactOverride = typeof meta.impact_override === 'number' ? meta.impact_override : null;
  const sexValue = typeof meta.sex === 'string' ? meta.sex : 'unknown';
  const orientationValue = typeof meta.sexual_orientation === 'string' ? meta.sexual_orientation : 'unknown';
  const archetypeValue = editedCharacter.archetype ?? '';
  const roleValue = editedCharacter.role ?? '';
  const sexSource = toFieldSource(meta.sex_source, sexValue !== 'unknown');
  const orientationSource = toFieldSource(meta.sexual_orientation_source, orientationValue !== 'unknown');
  const archetypeSource = toFieldSource(meta.archetype_source, Boolean(archetypeValue));
  const roleSource = toFieldSource(meta.role_source, Boolean(roleValue));
  const inferredNameParts = useMemo(
    () => inferNameParts(editedCharacter),
    [
      editedCharacter.id,
      editedCharacter.name,
      editedCharacter.first_name,
      editedCharacter.middle_name,
      editedCharacter.last_name,
      editedCharacter.metadata?.middle_name,
    ],
  );
  const [firstNameDraft, setFirstNameDraft] = useState(inferredNameParts.firstName);
  const [middleNameDraft, setMiddleNameDraft] = useState(inferredNameParts.middleName);
  const [lastNameDraft, setLastNameDraft] = useState(inferredNameParts.lastName);
  const [aliasesList, setAliasesList] = useState<string[]>(editedCharacter.alias ?? []);
  const [newAlias, setNewAlias] = useState('');
  const [archetypePresets, setArchetypePresets] = useState<ArchetypePreset[]>(FALLBACK_ARCHETYPE_PRESETS);
  const [autoArchetypeLoading, setAutoArchetypeLoading] = useState(false);
  const [autoArchetypeMessage, setAutoArchetypeMessage] = useState<string | null>(null);
  const [autoRoleLoading, setAutoRoleLoading] = useState(false);
  const [autoRoleMessage, setAutoRoleMessage] = useState<string | null>(null);
  const autoAttemptedRef = useRef<string | null>(null);
  const autoRoleAttemptedRef = useRef<string | null>(null);

  const addAlias = () => {
    const val = newAlias.trim();
    if (val && !aliasesList.includes(val)) {
      setAliasesList([...aliasesList, val]);
      setNewAlias('');
    }
  };

  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const humanizeType = (t: string) =>
    t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const archetypeOptions = useMemo<EditableFieldOption[]>(() => {
    const currentValues = splitMultiField(archetypeValue).map(normalizeArchetype);
    const presetOptions = archetypePresets.map((preset) => ({
      value: preset.value,
      label: preset.label,
    }));
    const customOptions = currentValues
      .filter((value) => value && !presetOptions.some((option) => option.value === value))
      .map((value) => ({ value, label: humanizeType(value) }));
    return [{ value: '', label: 'Clear archetypes' }, ...customOptions, ...presetOptions];
  }, [archetypePresets, archetypeValue]);

  const currentArchetypePresets = splitMultiField(archetypeValue)
    .map((value) => archetypePresets.find((preset) => preset.value === normalizeArchetype(value)))
    .filter((preset): preset is ArchetypePreset => Boolean(preset));
  const roleOptions = useMemo<EditableFieldOption[]>(() => {
    const currentValues = splitMultiField(roleValue).map((role) => role.toLowerCase().replace(/\s+/g, ' '));
    const customOptions = currentValues
      .filter((value) => value && !ROLE_PRESETS.some((option) => option.value === value))
      .map((value) => ({ value, label: humanizeType(value) }));
    return [{ value: '', label: 'Clear roles' }, ...customOptions, ...ROLE_PRESETS.filter((option) => option.value)];
  }, [roleValue]);

  useEffect(() => {
    setFirstNameDraft(inferredNameParts.firstName);
    setMiddleNameDraft(inferredNameParts.middleName);
    setLastNameDraft(inferredNameParts.lastName);
    setAliasesList(editedCharacter.alias ?? []);
  }, [editedCharacter.id, inferredNameParts.firstName, inferredNameParts.middleName, inferredNameParts.lastName, editedCharacter.alias]);

  useEffect(() => {
    if (isMockDataEnabled) {
      setArchetypePresets(FALLBACK_ARCHETYPE_PRESETS);
      return;
    }

    let cancelled = false;
    fetchJson<{ presets: ArchetypePreset[] }>('/api/characters/archetype-presets')
      .then((response) => {
        if (!cancelled && Array.isArray(response.presets) && response.presets.length > 0) {
          setArchetypePresets(response.presets);
        }
      })
      .catch((err) => {
        console.warn('Failed to load archetype presets; using fallback presets.', err);
      });

    return () => {
      cancelled = true;
    };
  }, [isMockDataEnabled]);
  const baseRelationshipTypeOptions: EditableFieldOption[] = [
    { value: 'boyfriend', label: 'Boyfriend' },
    { value: 'girlfriend', label: 'Girlfriend' },
    { value: 'wife', label: 'Wife' },
    { value: 'husband', label: 'Husband' },
    { value: 'fiancé', label: 'Fiance' },
    { value: 'fiancée', label: 'Fiancee' },
    { value: 'lover', label: 'Lover' },
    { value: 'fuck_buddy', label: 'Fuck buddy' },
    { value: 'ex_boyfriend', label: 'Ex-boyfriend' },
    { value: 'ex_girlfriend', label: 'Ex-girlfriend' },
    { value: 'ex_wife', label: 'Ex-wife' },
    { value: 'ex_husband', label: 'Ex-husband' },
    { value: 'ex_lover', label: 'Ex-lover' },
    { value: 'situationship', label: 'Situationship' },
    { value: 'crush', label: 'Crush' },
    { value: 'dating', label: 'Dating' },
    { value: 'talking', label: 'Talking' },
    { value: 'hooking_up', label: 'Hooking up' },
    { value: 'one_night_stand', label: 'One-night stand' },
    { value: 'friends_with_benefits', label: 'Friends with benefits' },
    { value: 'complicated', label: 'Complicated' },
    { value: 'on_break', label: 'On break' },
    { value: 'in_love', label: 'In love' },
    { value: 'obsession', label: 'Obsession' },
    { value: 'infatuation', label: 'Infatuation' },
    { value: 'lust', label: 'Lust' },
  ];
  const relationshipTypeOptions: EditableFieldOption[] =
    relationship?.relationship_type && !baseRelationshipTypeOptions.some((option) => option.value === relationship.relationship_type)
      ? [{ value: relationship.relationship_type, label: humanizeType(relationship.relationship_type) }, ...baseRelationshipTypeOptions]
      : baseRelationshipTypeOptions;
  const relationshipStatusOptions: EditableFieldOption[] = [
    { value: 'active', label: 'Active' },
    { value: 'on_break', label: 'On break' },
    { value: 'ended', label: 'Ended' },
    { value: 'complicated', label: 'Complicated' },
    { value: 'paused', label: 'Paused' },
    { value: 'ghosted', label: 'Ghosted' },
    { value: 'blocked', label: 'Blocked' },
    { value: 'unrequited', label: 'Unrequited' },
    { value: 'fading', label: 'Fading' },
    { value: 'rekindled', label: 'Rekindled' },
  ];
  const tierLabels: Record<string, string> = {
    inner_circle: 'Inner circle',
    close: 'Close',
    regular: 'Regular',
    peripheral: 'Peripheral',
    public_figure: 'Public figure',
  };

  const persistOverride = async (key: string, value: unknown) => {
    const patch =
      key === 'sex' || key === 'sexual_orientation'
        ? {
            [key]: value,
            [`${key}_source`]: value === 'unknown' ? 'unknown' : 'user_confirmed',
            [`${key}_confirmed_at`]: value === 'unknown' ? null : new Date().toISOString(),
          }
        : { [key]: value };
    setEditedCharacter((prev) => ({
      ...prev,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...patch },
    }));
    try {
      await updateCharacter({ id: characterId, values: { metadata: patch } }).unwrap();
      onUpdate();
    } catch (err) {
      console.error('Failed to save character override:', err);
      throw err instanceof Error ? err : new Error('Could not save character field');
    }
  };

  const saveIdentityNames = async () => {
    const firstName = firstNameDraft.trim();
    const middleName = middleNameDraft.trim();
    const lastName = lastNameDraft.trim();
    // Cohesion: aliases/nicknames must add something beyond the names already
    // on the card — drop entries that just repeat the title or name parts.
    const nameKeys = new Set(
      [
        editedCharacter.name,
        firstName,
        middleName,
        lastName,
        `${firstName} ${lastName}`,
        `${firstName} ${middleName} ${lastName}`,
      ]
        .map((v) => v?.trim().toLowerCase().replace(/\s+/g, ' '))
        .filter(Boolean),
    );
    const seenAliases = new Set<string>();
    const aliases = aliasesList
      .map((a) => a.replace(/\s+/g, ' ').trim())
      .filter((a) => {
        const key = a.toLowerCase();
        if (!a || nameKeys.has(key) || seenAliases.has(key)) return false;
        seenAliases.add(key);
        return true;
      });
    const metadataPatch = {
      middle_name: middleName || null,
      middle_name_source: middleName ? 'user_confirmed' : 'user_cleared',
      name_parts_confirmed_at: new Date().toISOString(),
    };

    setIdentitySaving(true);
    setIdentityError(null);
    setEditedCharacter((prev) => ({
      ...prev,
      first_name: firstName || null,
      middle_name: middleName || null,
      last_name: lastName || null,
      alias: aliases,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...metadataPatch },
    }));

    try {
      await updateCharacter({
        id: characterId,
        values: {
          name: editedCharacter.name,
          firstName: firstName || undefined,
          middleName: middleName || undefined,
          lastName: lastName || undefined,
          alias: aliases,
          metadata: metadataPatch,
        },
      }).unwrap();

      // Auto-sync a friendly card title from the new structured names (nickname + first)
      // only if the user hasn't locked a custom title. This keeps names vs title clearly separated
      // while giving good defaults for cards.
      const currentTitleMeta = (editedCharacter.metadata?.display_title as any) || {};
      const isLocked = currentTitleMeta.stability === 'locked';
      if (!isLocked) {
        const suggested = suggestDisplayTitleFromNames({
          ...editedCharacter,
          first_name: firstName,
          last_name: lastName,
          alias: aliases,
          metadata: { ...(editedCharacter.metadata || {}), ...metadataPatch },
        });
        if (suggested && suggested !== getCharacterDisplayTitle(editedCharacter as any)) {
          setEditedCharacter((prev) => ({
            ...prev,
            metadata: {
              ...((prev.metadata ?? {}) as Record<string, unknown>),
              display_title: {
                ...currentTitleMeta,
                primaryTitle: suggested,
                stability: 'stable',
                titleType: 'structured',
                generatedFromNames: true,
              },
            },
          }));
        }
      }

      onUpdate();
    } catch (err) {
      console.error('Failed to save character identity names:', err);
      setIdentityError(err instanceof Error ? err.message : 'Could not save names.');
    } finally {
      setIdentitySaving(false);
    }
  };

  const persistArchetype = async (nextRaw: string) => {
    const previousArchetype = editedCharacter.archetype ?? '';
    const nextArchetype = normalizeArchetypeList(nextRaw);
    const confirmedAt = new Date().toISOString();
    const metadataPatch = {
      archetype_source: nextArchetype ? 'user_confirmed' : 'user_cleared',
      archetype_confirmed_at: confirmedAt,
      manual_archetype_correction: {
        field: 'archetype',
        previous: previousArchetype || null,
        corrected: nextArchetype || null,
        corrected_at: confirmedAt,
      },
    };

    setEditedCharacter((prev) => ({
      ...prev,
      archetype: nextArchetype || undefined,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...metadataPatch },
    }));

    if (isMockDataEnabled) {
      onUpdate();
      return;
    }

    try {
      await updateCharacter({
        id: characterId,
        values: {
          archetype: nextArchetype,
          metadata: metadataPatch,
        },
      }).unwrap();

      onUpdate();
    } catch (err) {
      setEditedCharacter((prev) => ({
        ...prev,
        archetype: previousArchetype || undefined,
        metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>) },
      }));
      console.error('Failed to save character archetype:', err);
      throw err instanceof Error ? err : new Error('Could not save archetype');
    }
  };

  const persistRole = async (nextRaw: string) => {
    const previousRole = editedCharacter.role ?? '';
    const nextRole = normalizeRoleList(nextRaw);
    const confirmedAt = new Date().toISOString();
    const metadataPatch = {
      role_source: nextRole ? 'user_confirmed' : 'user_cleared',
      role_confirmed_at: confirmedAt,
      manual_role_correction: {
        field: 'role',
        previous: previousRole || null,
        corrected: nextRole || null,
        corrected_at: confirmedAt,
      },
    };

    setEditedCharacter((prev) => ({
      ...prev,
      role: nextRole || undefined,
      metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...metadataPatch },
    }));

    if (isMockDataEnabled) {
      onUpdate();
      return;
    }

    try {
      await updateCharacter({
        id: characterId,
        values: {
          role: nextRole,
          metadata: metadataPatch,
        },
      }).unwrap();
      onUpdate();
    } catch (err) {
      setEditedCharacter((prev) => ({
        ...prev,
        role: previousRole || undefined,
        metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>) },
      }));
      console.error('Failed to save character role:', err);
      throw err instanceof Error ? err : new Error('Could not save role');
    }
  };

  const autoDetectRole = async (trigger: 'automatic' | 'manual' = 'manual') => {
    const userConfirmed = meta.role_source === 'user' || meta.role_source === 'user_confirmed';
    if (userConfirmed && trigger === 'automatic') return;

    setAutoRoleLoading(true);
    setAutoRoleMessage(null);
    try {
      if (userConfirmed) {
        setAutoRoleMessage('Manual role is locked. Clear it before auto-detecting again.');
        return;
      }

      const inference = inferRoleFromLocalContext({
        role: editedCharacter.role,
        summary: editedCharacter.summary,
        tags: editedCharacter.tags,
        relationshipType: relationship?.relationship_type ?? (typeof meta.relationship_type === 'string' ? meta.relationship_type : undefined),
        kinship: typeof meta.kinship_label === 'string' ? meta.kinship_label : undefined,
      });
      if (!inference.role) {
        setAutoRoleMessage(inference.reason);
        return;
      }

      const detectedAt = new Date().toISOString();
      const metadataPatch = {
        role_source: 'auto',
        role_reason: inference.reason,
        role_detected_at: detectedAt,
      };
      setEditedCharacter((prev) => ({
        ...prev,
        role: inference.role,
        metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), ...metadataPatch },
      }));

      if (!isMockDataEnabled) {
        await updateCharacter({
          id: characterId,
          values: {
            role: inference.role,
            metadata: metadataPatch,
          },
        }).unwrap();
      }

      setAutoRoleMessage(`Auto-detected ${inference.role}: ${inference.reason}`);
      onUpdate();
    } catch (err) {
      console.error('Failed to auto-detect character role:', err);
      setAutoRoleMessage('Could not auto-detect a factual role yet. Pick or type one manually.');
    } finally {
      setAutoRoleLoading(false);
    }
  };

  const autoDetectArchetype = async (trigger: 'automatic' | 'manual' = 'manual') => {
    const userConfirmed = meta.archetype_source === 'user' || meta.archetype_source === 'user_confirmed';
    if (userConfirmed && trigger === 'automatic') return;

    setAutoArchetypeLoading(true);
    setAutoArchetypeMessage(null);

    try {
      if (isMockDataEnabled) {
        if (userConfirmed) {
          setAutoArchetypeMessage('Manual archetype is locked. Clear it before auto-detecting again.');
          return;
        }
        const inference = inferArchetypeFromLocalContext({
          role: editedCharacter.role,
          summary: editedCharacter.summary,
          tags: editedCharacter.tags,
          relationshipType: relationship?.relationship_type ?? (typeof meta.relationship_type === 'string' ? meta.relationship_type : undefined),
          kinship: typeof meta.kinship_label === 'string' ? meta.kinship_label : undefined,
        });
        const detectedAt = new Date().toISOString();
        setEditedCharacter((prev) => ({
          ...prev,
          archetype: inference.archetype,
          metadata: {
            ...((prev.metadata ?? {}) as Record<string, unknown>),
            archetype_source: 'auto',
            archetype_reason: inference.reason,
            archetype_detected_at: detectedAt,
          },
        }));
        setAutoArchetypeMessage(`Auto-detected ${humanizeType(inference.archetype)}: ${inference.reason}`);
        onUpdate();
        return;
      }

      const response = await fetchJson<{
        archetype: string;
        source: 'auto' | 'user';
        applied: boolean;
        reason: string;
        confidence?: number;
      }>(`/api/characters/${characterId}/archetype/auto`, { method: 'POST' });

      setEditedCharacter((prev) => ({
        ...prev,
        archetype: response.archetype || prev.archetype,
        metadata: {
          ...((prev.metadata ?? {}) as Record<string, unknown>),
          archetype_source: response.source === 'user' ? 'user_confirmed' : response.source,
          archetype_reason: response.reason,
          archetype_confidence: response.confidence,
          archetype_detected_at: new Date().toISOString(),
        },
      }));
      setAutoArchetypeMessage(
        response.source === 'user'
          ? response.reason
          : `${response.applied ? 'Auto-detected' : 'Already matched'} ${humanizeType(response.archetype)}: ${response.reason}`,
      );
      onUpdate();
    } catch (err) {
      console.error('Failed to auto-detect character archetype:', err);
      setAutoArchetypeMessage('Could not auto-detect from context yet. Pick a preset manually.');
    } finally {
      setAutoArchetypeLoading(false);
    }
  };

  useEffect(() => {
    if (autoAttemptedRef.current === editedCharacter.id) return;
    const userConfirmed = meta.archetype_source === 'user' || meta.archetype_source === 'user_confirmed';
    const shouldAutoDetect =
      !userConfirmed &&
      (!editedCharacter.archetype || meta.archetype_source === 'auto') &&
      Boolean(editedCharacter.summary || editedCharacter.role || relationship?.relationship_type || editedCharacter.tags?.length);
    if (!shouldAutoDetect) return;

    autoAttemptedRef.current = editedCharacter.id;
    void autoDetectArchetype('automatic');
  }, [
    editedCharacter.id,
    editedCharacter.archetype,
    editedCharacter.summary,
    editedCharacter.role,
    editedCharacter.tags,
    meta.archetype_source,
    relationship?.relationship_type,
  ]);

  useEffect(() => {
    if (autoRoleAttemptedRef.current === editedCharacter.id) return;
    const userConfirmed = meta.role_source === 'user' || meta.role_source === 'user_confirmed';
    const shouldAutoDetect =
      !userConfirmed &&
      (!editedCharacter.role || meta.role_source === 'auto') &&
      Boolean(editedCharacter.summary || relationship?.relationship_type || editedCharacter.tags?.length);
    if (!shouldAutoDetect) return;

    autoRoleAttemptedRef.current = editedCharacter.id;
    void autoDetectRole('automatic');
  }, [
    editedCharacter.id,
    editedCharacter.role,
    editedCharacter.summary,
    editedCharacter.tags,
    meta.role_source,
    relationship?.relationship_type,
  ]);

  const persistRelationshipType = async (nextType: string) => {
    if (!relationship?.id) throw new Error('This relationship is not editable yet.');
    await fetchJson<{ success: boolean; relationship: Relationship }>(
      `/api/conversation/romantic-relationships/${relationship.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          relationship_type: nextType,
          metadata: {
            relationship_type_source: 'user_confirmed',
            relationship_type_confirmed_at: new Date().toISOString(),
          },
          reason: 'user_corrected_relationship_type',
        }),
      }
    );
    onUpdate();
  };

  const persistRelationshipStatus = async (nextStatus: string) => {
    if (!relationship?.id) throw new Error('This relationship is not editable yet.');
    await fetchJson<{ success: boolean; relationship: Relationship }>(
      `/api/conversation/romantic-relationships/${relationship.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          metadata: {
            relationship_status_source: 'user_confirmed',
            relationship_status_confirmed_at: new Date().toISOString(),
          },
          reason: 'user_corrected_relationship_status',
        }),
      }
    );
    onUpdate();
  };

  const healthScore = dynamics?.health?.health_score;
  const healthTrend = dynamics?.health?.trends?.health_trend;
  const memoryCount = editedCharacter.memory_count ?? 0;
  const connectionCount = editedCharacter.relationship_count ?? editedCharacter.relationships?.length ?? 0;
  const standing =
    standingOverride ?? socialStanding?.tier ?? editedCharacter.importance_level ?? 'Still learning';

  const mockProvenanceMap: Record<string, NonNullable<CharacterInfoPanelProps['provenance']>> = {
    'Sarah Chen': { mentionCount: 156, firstMentionedAt: '2018-09-20T00:00:00Z', lastMentionedAt: new Date(Date.now() - 7 * 86400000).toISOString(), sourceUtterances: [{ content: 'I had coffee with Sarah today — she was the first person I told about wanting to leave tech.', created_at: '2018-09-20T00:00:00Z' }] },
    'Marcus Johnson': { mentionCount: 98, firstMentionedAt: '2020-03-12T00:00:00Z', lastMentionedAt: new Date(Date.now() - 14 * 86400000).toISOString(), sourceUtterances: [{ content: 'Met Marcus at that entrepreneurship event.', created_at: '2020-03-12T00:00:00Z' }] },
  };
  const p = isMockDataEnabled ? mockProvenanceMap[editedCharacter.name] ?? provenance : provenance;
  const lifeImpact =
    relationship && isMockDataEnabled
      ? resolveMockRelationshipInfluence({
          relationshipId: relationship.id,
          personId: characterId,
          personName: editedCharacter.name,
        })
      : undefined;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. Story summary ───────────────────────────────────────────── */}
      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-black/40 to-black/60 p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-white">Who they are to you</h2>
            {editedCharacter.role && (
              <p className="text-xs text-primary/80 mt-0.5 capitalize">Occupation: {editedCharacter.role.replace(/_/g, ' ')}</p>
            )}
          </div>
        </div>
        {editedCharacter.summary ? (
          <p className="text-sm sm:text-base text-white/85 leading-relaxed whitespace-pre-wrap">{editedCharacter.summary}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-white/45 italic">
              LoreBook is still learning {shortDisplayName(editedCharacter.name)}&apos;s story.
            </p>
            <UnknownField
              label="Their story"
              prompt={`Let me tell you about ${editedCharacter.name}: `}
              onAskInChat={askInChat}
            />
          </div>
        )}
        {editedCharacter.archetype && (
          <Badge variant="outline" className="mt-3 bg-purple-500/10 text-purple-300 border-purple-500/30 text-xs">
            {editedCharacter.archetype}
          </Badge>
        )}
      </section>

      {/* ── 2. At a glance ───────────────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2">At a glance</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <StatCell
            label="Standing"
            value={tierLabels[standing] ?? String(standing).replace(/_/g, ' ')}
          />
          <StatCell label="Memories" value={memoryCount} sub={memoryCount === 1 ? 'mention' : 'mentions'} />
          <StatCell label="Connections" value={connectionCount} />
          {relationshipStatus ? (
            <StatCell label="Status" value={relationshipStatus} />
          ) : (
            <StatCell label="Depth" value={editedCharacter.relationship_depth?.replace(/_/g, ' ') ?? '—'} />
          )}
          {healthScore != null && (
            <StatCell
              label="Relationship health"
              value={`${healthScore}%`}
              sub={healthTrend ? `${healthTrend === 'improving' ? '↑' : healthTrend === 'declining' ? '↓' : '→'} ${healthTrend}` : undefined}
            />
          )}
          {editedCharacter.importance_score != null && (
            <StatCell label="Importance" value={`${Math.round(editedCharacter.importance_score)}/100`} />
          )}
          {dynamics?.lifecycle?.current_stage && (
            <StatCell label="Life stage" value={dynamics.lifecycle.current_stage.replace(/_/g, ' ')} />
          )}
          {(editedCharacter.alias?.length ?? 0) > 0 && (
            <StatCell label="Also known as" value={editedCharacter.alias!.slice(0, 2).join(', ')} />
          )}
        </div>
      </section>

      {/* ── 2b. Identity details ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 border border-white/10">
            <User className="h-4 w-4 text-white/55" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">Identity details (structured names)</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              First / Middle / Last + Nicknames are the canonical record for this person. These drive matching, family trees,
              and relationship logic. The <span className="font-medium text-white/70">card title</span> (shown on lists and in CharacterTitleSection) is a separate, presentational value — typically “Nickname (First Last)” or a contextual form.
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">First</span>
                  <input
                    value={firstNameDraft}
                    onChange={(e) => setFirstNameDraft(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">Middle</span>
                  <input
                    value={middleNameDraft}
                    onChange={(e) => setMiddleNameDraft(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">Last</span>
                  <input
                    value={lastNameDraft}
                    onChange={(e) => setLastNameDraft(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="text-[10px] uppercase tracking-wide text-white/35">Nicknames / aliases (multiple)</span>
                <div className="mt-1 flex flex-wrap gap-1 min-h-[32px]">
                  {aliasesList.map((alias, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white">
                      {alias}
                      <button
                        type="button"
                        onClick={() => setAliasesList(aliasesList.filter((_, i) => i !== idx))}
                        className="ml-1 text-white/50 hover:text-white/80"
                        aria-label={`Remove ${alias}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex gap-2">
                  <input
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }}
                    placeholder="Add nickname or alias and press Enter"
                    className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm text-white focus:border-primary/60 focus:outline-none"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={addAlias}
                    disabled={!newAlias.trim()}
                    className="rounded-lg border border-primary/35 bg-primary/15 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
                  >
                    Add
                  </button>
                </div>
              </label>
              {identityError && <p className="mt-2 text-xs text-red-300">{identityError}</p>}
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveIdentityNames()}
                  disabled={identitySaving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/35 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  {identitySaving ? 'Saving...' : 'Save names'}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-sky-500/20 bg-sky-950/15 p-3 sm:col-span-2 sm:p-3.5">
                <div className="mb-3 flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300/80" />
                  <p className="min-w-0 text-xs leading-relaxed text-white/60">
                    Roles are factual context: what they are or were in real life, like student, musician, coworker, or
                    high school student. Keep this to the strongest few; archetypes below organize the story relationship.
                  </p>
                </div>
                <EditableField
                  label="Role"
                  value={roleValue}
                  displayValue={roleValue || null}
                  source={roleSource}
                  variant="multi-select"
                  options={roleOptions}
                  maxSelections={MAX_CHARACTER_ROLES}
                  emptyHint="Click to set role"
                  icon={<User className="h-3.5 w-3.5 text-sky-300" />}
                  onSave={persistRole}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    {autoRoleMessage && (
                      <p className="text-[11px] leading-relaxed text-sky-200/75">{autoRoleMessage}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void autoDetectRole('manual')}
                    disabled={autoRoleLoading}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-60 sm:w-auto"
                  >
                    {autoRoleLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Auto-detect role
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                  Pick up to {MAX_CHARACTER_ROLES} factual roles. Put smaller details in the summary or tags.
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-purple-500/20 bg-purple-950/15 p-3 sm:col-span-2 sm:p-3.5">
                <div className="mb-3 flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-300/80" />
                  <p className="min-w-0 text-xs leading-relaxed text-white/60">
                    If LoreBook guessed the wrong archetypes, click the pencil and correct them here. Your edit updates this
                    character and is saved as a learning signal so future entity detection can use your correction.
                  </p>
                </div>
                <EditableField
                  label="Archetype"
                  value={archetypeValue}
                  displayValue={archetypeValue ? humanizeType(archetypeValue) : null}
                  source={archetypeSource}
                  variant="multi-select"
                  options={archetypeOptions}
                  maxSelections={MAX_CHARACTER_ARCHETYPES}
                  emptyHint="Click to set archetype"
                  icon={<Sparkles className="h-3.5 w-3.5 text-purple-300" />}
                  onSave={persistArchetype}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    {currentArchetypePresets.length > 0 && (
                      <p className="text-[11px] leading-relaxed text-white/45">
                        {currentArchetypePresets.map((preset) => `${preset.label}: ${preset.description}`).join(' ')}
                      </p>
                    )}
                    {autoArchetypeMessage && (
                      <p className="mt-1 text-[11px] leading-relaxed text-purple-200/75">{autoArchetypeMessage}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void autoDetectArchetype('manual')}
                    disabled={autoArchetypeLoading}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-lg border border-purple-400/25 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-200 hover:bg-purple-500/20 disabled:opacity-60 sm:w-auto"
                  >
                    {autoArchetypeLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    Auto-detect
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                  Pick up to {MAX_CHARACTER_ARCHETYPES} story archetypes. The first one remains the primary signal for older views.
                </p>
              </div>
              <EditableField
                label="Sex"
                value={sexValue}
                displayValue={SEX_OPTIONS.find((option) => option.value === sexValue)?.label ?? humanizeType(sexValue)}
                source={sexSource}
                variant="select"
                options={SEX_OPTIONS}
                onSave={(next) => persistOverride('sex', next)}
              />
              <EditableField
                label="Sexual orientation"
                value={orientationValue}
                displayValue={ORIENTATION_OPTIONS.find((option) => option.value === orientationValue)?.label ?? humanizeType(orientationValue)}
                source={orientationSource}
                variant="select"
                options={ORIENTATION_OPTIONS}
                onSave={(next) => persistOverride('sexual_orientation', next)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Skills, hobbies, groups, people (mention-derived lore) ───── */}
      <CharacterLoreProfileSection
        profile={loreProfile ?? null}
        loading={loreProfileLoading}
        currentCharacterId={characterId}
        characterFirstName={shortDisplayName(editedCharacter.name)}
        relationships={editedCharacter.relationships}
        onAskInChat={askInChat}
        onOpenCharacter={onOpenCharacterById}
        onAddPerson={onAddWorldPerson}
        onUpdatePerson={onUpdateWorldPerson}
        onDeletePerson={onDeleteWorldPerson}
      />

      {/* ── 3. Your relationship (romantic / close) ──────────────────── */}
      {relationship && (
        <section className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-white">Your relationship</h3>
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <EditableField
              label="Relationship type"
              value={relationship.relationship_type}
              displayValue={relationshipTypeOptions.find((option) => option.value === relationship.relationship_type)?.label ?? humanizeType(relationship.relationship_type)}
              source={toFieldSource(relationship.metadata?.relationship_type_source, Boolean(relationship.relationship_type))}
              variant="select"
              options={relationshipTypeOptions}
              onSave={persistRelationshipType}
              disabled={!relationship.id || isMockDataEnabled}
            />
            <EditableField
              label="Status"
              value={relationship.status ?? 'active'}
              displayValue={relationshipStatusOptions.find((option) => option.value === relationship.status)?.label ?? humanizeType(relationship.status ?? 'active')}
              source={toFieldSource(relationship.metadata?.relationship_status_source, Boolean(relationship.status))}
              variant="select"
              options={relationshipStatusOptions}
              onSave={persistRelationshipStatus}
              disabled={!relationship.id || isMockDataEnabled}
            />
          </div>
          {relationship.is_situationship && (
            <div className="mb-3">
              <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300">Situationship</Badge>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <StatCell label="Compatibility" value={`${Math.round((relationship.compatibility_score ?? 0) * 100)}%`} />
            <StatCell label="Health" value={`${Math.round((relationship.relationship_health ?? 0) * 100)}%`} />
            <StatCell label="Your interest" value={`${Math.round((relationship.affection_score ?? 0) * 100)}%`} />
            {relationship.start_date && (
              <StatCell
                label="Since"
                value={new Date(relationship.start_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              />
            )}
          </div>
          {(relationship.pros?.length ?? 0) > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              {relationship.pros!.length > 0 && (
                <ul className="space-y-1 text-white/70">
                  {relationship.pros!.slice(0, 3).map((pro, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-emerald-400">+</span>{pro}</li>
                  ))}
                </ul>
              )}
              {(relationship.cons?.length ?? 0) > 0 && (
                <ul className="space-y-1 text-white/70">
                  {relationship.cons!.slice(0, 3).map((con, i) => (
                    <li key={i} className="flex gap-1.5"><span className="text-red-400">−</span>{con}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mt-3">
            <RelationshipFlagsPanel
              redFlags={relationship.red_flags ?? []}
              greenFlags={relationship.green_flags ?? []}
              compact
            />
          </div>
          {lifeImpact && (
            <div className="mt-4 pt-4 border-t border-rose-500/15">
              <h4 className="text-xs font-semibold text-rose-200/90 mb-2">Life impact</h4>
              <RelationshipLifeImpactPanel
                influence={lifeImpact}
                personName={shortDisplayName(editedCharacter.name)}
                compact
              />
            </div>
          )}
        </section>
      )}

      {/* ── 4. Work & life ───────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <section className="rounded-xl border border-amber-500/20 bg-amber-950/15 p-3.5">
          <h3 className="text-xs font-bold text-amber-200/90 flex items-center gap-1.5 mb-2">
            <Briefcase className="h-3.5 w-3.5" /> Work
          </h3>
          {occupations.length > 0 || workplaces.length > 0 || sideHustles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {[...occupations, ...workplaces, ...sideHustles].slice(0, 8).map((v) => (
                <Badge key={v} variant="outline" className="text-[11px] bg-amber-500/10 text-amber-200 border-amber-500/25">{v}</Badge>
              ))}
            </div>
          ) : (
            <UnknownField label="Work" prompt={`What ${editedCharacter.name} does for work: `} onAskInChat={askInChat} />
          )}
        </section>

        <section className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3.5">
          <h3 className="text-xs font-bold text-cyan-200/90 flex items-center gap-1.5 mb-2">
            <MapPin className="h-3.5 w-3.5" /> Life details
          </h3>
          <div className="space-y-1.5">
            {lifeMap.filter((i) => i.value).slice(0, 4).map((item) => (
              <div key={item.label} className="flex justify-between gap-2 text-xs">
                <span className="text-white/40">{item.label}</span>
                <span className="text-white/80 text-right truncate">{item.value}</span>
              </div>
            ))}
            {lifeMap.filter((i) => !i.value).slice(0, 2).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => askInChat(item.prompt)}
                className="text-[11px] text-primary/80 hover:text-primary"
              >
                + Add {item.label.toLowerCase()}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── 5. Key people ──────────────────────────────────────────────── */}
      {(strongestConnections.length > 0 || romanticConnections.length > 0) && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Key people
          </h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {[...romanticConnections, ...strongestConnections.filter((s) => !romanticConnections.some((r) => r.character_id === s.character_id))].slice(0, 4).map((rel) => (
              <button
                key={rel.id ?? rel.character_id ?? rel.character_name}
                type="button"
                onClick={() => openCharacterByRelationship(rel)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left hover:border-primary/30 hover:bg-primary/5 transition-colors touch-manipulation"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white truncate">{rel.character_name}</span>
                  {rel.closeness_score != null && (
                    <span className="text-[10px] text-emerald-400 shrink-0">{rel.closeness_score}/10</span>
                  )}
                </div>
                <p className="text-[10px] text-white/40 capitalize mt-0.5 truncate">
                  {rel.relationship_type.replace(/_/g, ' ')}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── 6. Personality ───────────────────────────────────────────── */}
      {behaviorAttributes.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Smile className="h-3.5 w-3.5" /> Personality & patterns
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {behaviorAttributes.slice(0, 8).map((attr) => (
              <span
                key={`${attr.attributeType}-${attr.attributeValue}`}
                className="text-xs px-2.5 py-1 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-200"
                title={attr.evidence}
              >
                {attr.attributeValue}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── 7. Your ranking overrides ──────────────────────────────────── */}
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Star className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Your ranking</h3>
        </div>
        <p className="text-xs text-white/50 mb-3">Override computed standing — your call wins.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 mb-1 block">Standing</label>
            <select
              data-testid="standing-override-select"
              aria-label="Standing tier override"
              value={standingOverride ?? 'auto'}
              onChange={(e) => {
                const v = e.target.value;
                void persistOverride('standing_override', v === 'auto' ? null : { tier: v, set_at: new Date().toISOString() });
              }}
              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            >
              <option value="auto">Auto{tierLabels[socialStanding?.tier ?? ''] ? ` (${tierLabels[socialStanding!.tier!]})` : ''}</option>
              <option value="inner_circle">Inner circle</option>
              <option value="close">Close</option>
              <option value="regular">Regular</option>
              <option value="peripheral">Peripheral</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-white/40 mb-1 block">
              Impact on you {impactOverride !== null ? `· ${impactOverride}/100` : ''}
            </label>
            {impactOverride === null ? (
              <button
                type="button"
                data-testid="impact-override-enable"
                onClick={() => void persistOverride('impact_override', Math.round(editedCharacter.analytics?.character_influence_on_user ?? 50))}
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-left text-xs text-white/60 hover:border-emerald-500/40"
              >
                Auto ({Math.round(editedCharacter.analytics?.character_influence_on_user ?? 0)}/100) — tap to set
              </button>
            ) : (
              <input
                type="range"
                min={0}
                max={100}
                value={impactOverride}
                aria-label="Impact on me"
                data-testid="impact-override-slider"
                onChange={(e) => setEditedCharacter((prev) => ({
                  ...prev,
                  metadata: { ...((prev.metadata ?? {}) as Record<string, unknown>), impact_override: Number(e.target.value) },
                }))}
                onPointerUp={(e) => void persistOverride('impact_override', Number((e.currentTarget as HTMLInputElement).value))}
                className="w-full accent-emerald-400 mt-2"
              />
            )}
          </div>
        </div>
      </section>

      {/* ── 8. Detected attributes ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Detected from chat
          </h3>
          {characterAttributes.length > 0 && (
            <span className="text-[10px] text-white/25">{characterAttributes.length}</span>
          )}
        </div>
        {loadingAttributes ? (
          <p className="text-xs text-white/40 flex items-center gap-2 py-2">
            <Clock className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        ) : characterAttributes.length === 0 ? (
          <p className="text-xs text-white/35 py-1">
            No attributes yet — keep journaling about {shortDisplayName(editedCharacter.name)}.
          </p>
        ) : (
          <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {characterAttributes.slice(0, 12).map((attr, idx) => (
              <div key={idx} className="flex items-start gap-2 px-3 py-2.5 bg-white/[0.02]">
                <span className="text-[9px] uppercase tracking-wide text-white/30 shrink-0 mt-0.5 w-16">
                  {attr.attributeType.replace(/_/g, ' ')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90">{attr.attributeValue}</p>
                  {attr.evidence && (
                    <p className="text-[10px] text-white/35 mt-0.5 line-clamp-1 italic">{attr.evidence}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 9. Provenance ──────────────────────────────────────────────── */}
      {p && (
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> How LoreBook knows them
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50 mb-2">
            {(p.mentionCount ?? 0) > 0 && <span><strong className="text-white/75">{p.mentionCount}</strong> mentions</span>}
            {p.firstMentionedAt && (
              <span>First: {new Date(p.firstMentionedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            )}
            {p.lastMentionedAt && (
              <span>Last: {new Date(p.lastMentionedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
            )}
          </div>
          {p.sourceUtterances?.[0] && (
            <blockquote className="border-l-2 border-white/15 pl-3 text-xs text-white/55 italic line-clamp-2">
              &ldquo;{p.sourceUtterances[0].content}&rdquo;
            </blockquote>
          )}
        </section>
      )}

      <p className="text-[10px] text-white/30 flex items-center gap-1.5 pb-2">
        <Info className="h-3 w-3 shrink-0" />
        Profile updates from your conversations. Use Chat to add or correct details.
      </p>
    </div>
  );
}
