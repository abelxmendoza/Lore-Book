import {
  Briefcase,
  Building2,
  MapPin,
  TreePine,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { CHAT_FOCUS_SOURCE_LABELS, type ChatFocusEntityType, type ChatFocusSourceSurface } from '../../types/chatFocus';
import type { FocusedEntityLauncherCopy, FocusedEntityLauncherTheme } from './FocusedEntityChatLauncher';

export type FocusedEntityBookKind = 'characters' | 'organizations' | 'locations' | 'projects' | 'family';

export type IntroducePromptMeta = {
  rolePhrase?: string | null;
  supportsAnchor?: string | null;
};

export type FocusedEntityChatPreset = {
  kind: FocusedEntityBookKind;
  entityType: ChatFocusEntityType;
  sourceSurface: ChatFocusSourceSurface;
  sourceLabel: string;
  knowledgeScope: string;
  icon: LucideIcon;
  copy: FocusedEntityLauncherCopy;
  theme: FocusedEntityLauncherTheme;
  existingPrompt: (name: string) => string;
  introducePrompt: (name: string, meta?: IntroducePromptMeta) => string;
  pendingIdPrefix: string;
};

const charactersTheme: FocusedEntityLauncherTheme = {
  collapsedBorder: 'border-sky-500/30',
  collapsedBg: 'bg-gradient-to-r from-sky-950/30 via-slate-950/20 to-black/30',
  expandedBorder: 'border-sky-400/40',
  expandedBg: 'bg-gradient-to-br from-sky-950/35 via-slate-950/25 to-black/40',
  iconWrap: 'border-sky-400/25 bg-sky-500/10',
  iconClass: 'text-sky-300',
  ctaClass: 'bg-sky-600 hover:bg-sky-500',
  inputClass: 'border-sky-500/25 bg-black/40 text-white placeholder:text-white/35',
  matchHover: 'hover:bg-sky-500/10 hover:text-white',
  matchMeta: 'text-sky-200/65',
};

const organizationsTheme: FocusedEntityLauncherTheme = {
  collapsedBorder: 'border-amber-500/30',
  collapsedBg: 'bg-gradient-to-r from-amber-950/30 via-orange-950/20 to-black/30',
  expandedBorder: 'border-amber-400/40',
  expandedBg: 'bg-gradient-to-br from-amber-950/35 via-orange-950/25 to-black/40',
  iconWrap: 'border-amber-400/25 bg-amber-500/10',
  iconClass: 'text-amber-300',
  ctaClass: 'bg-amber-600 hover:bg-amber-500',
  inputClass: 'border-amber-500/25 bg-black/40 text-white placeholder:text-white/35',
  matchHover: 'hover:bg-amber-500/10 hover:text-white',
  matchMeta: 'text-amber-200/65',
};

const locationsTheme: FocusedEntityLauncherTheme = {
  collapsedBorder: 'border-emerald-500/30',
  collapsedBg: 'bg-gradient-to-r from-emerald-950/30 via-teal-950/20 to-black/30',
  expandedBorder: 'border-emerald-400/40',
  expandedBg: 'bg-gradient-to-br from-emerald-950/35 via-teal-950/25 to-black/40',
  iconWrap: 'border-emerald-400/25 bg-emerald-500/10',
  iconClass: 'text-emerald-300',
  ctaClass: 'bg-emerald-600 hover:bg-emerald-500',
  inputClass: 'border-emerald-500/25 bg-black/40 text-white placeholder:text-white/35',
  matchHover: 'hover:bg-emerald-500/10 hover:text-white',
  matchMeta: 'text-emerald-200/65',
};

const familyTheme: FocusedEntityLauncherTheme = {
  collapsedBorder: 'border-emerald-500/30',
  collapsedBg: 'bg-gradient-to-r from-emerald-950/30 via-green-950/20 to-black/30',
  expandedBorder: 'border-emerald-400/40',
  expandedBg: 'bg-gradient-to-br from-emerald-950/35 via-green-950/25 to-black/40',
  iconWrap: 'border-emerald-400/25 bg-emerald-500/10',
  iconClass: 'text-emerald-300',
  ctaClass: 'bg-emerald-600 hover:bg-emerald-500',
  inputClass: 'border-emerald-500/25 bg-black/40 text-white placeholder:text-white/35',
  matchHover: 'hover:bg-emerald-500/10 hover:text-white',
  matchMeta: 'text-emerald-200/65',
};

const projectsTheme: FocusedEntityLauncherTheme = {
  collapsedBorder: 'border-violet-500/30',
  collapsedBg: 'bg-gradient-to-r from-violet-950/30 via-indigo-950/20 to-black/30',
  expandedBorder: 'border-violet-400/40',
  expandedBg: 'bg-gradient-to-br from-violet-950/35 via-indigo-950/25 to-black/40',
  iconWrap: 'border-violet-400/25 bg-violet-500/10',
  iconClass: 'text-violet-300',
  ctaClass: 'bg-violet-600 hover:bg-violet-500',
  inputClass: 'border-violet-500/25 bg-black/40 text-white placeholder:text-white/35',
  matchHover: 'hover:bg-violet-500/10 hover:text-white',
  matchMeta: 'text-violet-200/65',
};

export const FOCUSED_ENTITY_CHAT_PRESETS: Record<FocusedEntityBookKind, FocusedEntityChatPreset> = {
  characters: {
    kind: 'characters',
    entityType: 'character',
    sourceSurface: 'characters',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.characters,
    knowledgeScope: 'who they are, how you know them, and what matters in your shared story',
    icon: Users,
    theme: charactersTheme,
    pendingIdPrefix: 'pending:character',
    copy: {
      collapsedTitle: 'Someone new in the cast?',
      collapsedBody:
        'Start a focused chat. Choose someone already in Character Book or introduce a new person — LoreBook will attach their chip and grow their context as you talk.',
      ctaLabel: 'Add someone in chat',
      expandedTitle: 'Add someone in chat',
      expandedBody: 'Search Character Book first, or enter a new name to introduce them.',
      namePlaceholder: 'Their name',
      nameAriaLabel: 'Character name',
      matchListAriaLabel: 'Character Book matches',
      inBookLabel: 'In Character Book',
      footerNote: 'You decide what becomes part of their story. LoreBook only captures what you share.',
      introduceVerb: 'Introduce',
    },
    existingPrompt: (name) =>
      `I want to talk about ${name}. Help me capture who they are, how we know each other, and what matters about them right now. Please do not invent details I have not shared.`,
    introducePrompt: (name, meta) => {
      const roleBit = meta?.rolePhrase
        ? ` Their role is ${meta.rolePhrase}${meta.supportsAnchor ? ` supporting ${meta.supportsAnchor}` : ''}.`
        : '';
      const howBit = meta?.supportsAnchor
        ? ` I know them through ${meta.supportsAnchor}.`
        : ' Plus how we know each other.';
      return (
        `I want to tell you about ${name}, someone new in my life. ` +
        `Their name is ${name}.${roleBit}` +
        ` Let me know any aliases or nicknames I call them too.${howBit} ` +
        `Please remember them as ${name}` +
        (meta?.rolePhrase ? ` with “${meta.rolePhrase}” as their role` : '') +
        `, not as a role-shaped name.`
      );
    },
  },
  organizations: {
    kind: 'organizations',
    entityType: 'organization',
    sourceSurface: 'organizations',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.organizations,
    knowledgeScope: 'what the group is, who is in it, and how it fits your life',
    icon: Building2,
    theme: organizationsTheme,
    pendingIdPrefix: 'pending:organization',
    copy: {
      collapsedTitle: 'A group on your radar?',
      collapsedBody:
        'Start a focused chat. Choose a group already in Groups & Organizations or name a new one — LoreBook will attach their chip and grow that circle’s context as you talk.',
      ctaLabel: 'Add a group in chat',
      expandedTitle: 'Add a group in chat',
      expandedBody: 'Search Groups & Organizations first, or enter a new group name to introduce it.',
      namePlaceholder: 'Group or organization name',
      nameAriaLabel: 'Group or organization name',
      matchListAriaLabel: 'Groups & Organizations matches',
      inBookLabel: 'In Groups & Organizations',
      footerNote: 'Teams, crews, companies, scenes — whatever circle matters. You decide what sticks.',
      introduceVerb: 'Introduce',
    },
    existingPrompt: (name) =>
      `I want to talk about ${name}. Help me capture what this group is, who is in it, and how it fits into my life. Please do not invent details I have not shared.`,
    introducePrompt: (name) =>
      `I want to tell you about ${name}, a group or organization in my life. ` +
      `Its name is ${name} — help me capture what it is, any other names people use for it, ` +
      `and how I’m connected to it.`,
  },
  locations: {
    kind: 'locations',
    entityType: 'location',
    sourceSurface: 'locations',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.locations,
    knowledgeScope: 'what this place is, why it matters, and what happens there',
    icon: MapPin,
    theme: locationsTheme,
    pendingIdPrefix: 'pending:location',
    copy: {
      collapsedTitle: 'Somewhere on your map?',
      collapsedBody:
        'Start a focused chat. Pick a place already in Places or name somewhere new — LoreBook will attach its chip and grow that location’s context as you talk.',
      ctaLabel: 'Add a place in chat',
      expandedTitle: 'Add a place in chat',
      expandedBody: 'Search Places first, or enter a new place name to put it on the map.',
      namePlaceholder: 'Place name',
      nameAriaLabel: 'Place name',
      matchListAriaLabel: 'Places matches',
      inBookLabel: 'In Places',
      footerNote: 'Homes, venues, cities, hangouts — capture the places that shape your story.',
      introduceVerb: 'Map',
    },
    existingPrompt: (name) =>
      `I want to talk about ${name}. Help me capture what this place is, why it matters to me, and what happens there. Please do not invent details I have not shared.`,
    introducePrompt: (name) =>
      `I want to tell you about ${name}, a place in my life. ` +
      `Its name is ${name} — help me capture where it is, any nicknames I use for it, ` +
      `and why it matters.`,
  },
  projects: {
    kind: 'projects',
    entityType: 'project',
    sourceSurface: 'projects',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.projects,
    knowledgeScope: 'project goals, progress, and priorities',
    icon: Briefcase,
    theme: projectsTheme,
    pendingIdPrefix: 'pending:project',
    copy: {
      collapsedTitle: 'A project taking shape?',
      collapsedBody:
        'Start a focused chat. Choose a project already in Projects Book or start a new thread — LoreBook will attach its chip and grow goals and progress as you talk.',
      ctaLabel: 'Add a project in chat',
      expandedTitle: 'Add a project in chat',
      expandedBody: 'Search Projects Book first, or enter a new project name to start the thread.',
      namePlaceholder: 'Project name',
      nameAriaLabel: 'Project name',
      matchListAriaLabel: 'Projects Book matches',
      inBookLabel: 'In Projects Book',
      footerNote: 'Goals, builds, side hustles — talk it out and LoreBook will keep the thread.',
      introduceVerb: 'Start',
    },
    existingPrompt: (name) =>
      `I want to talk about ${name}. Help me capture what this project is, where it stands, and what matters next. Please do not invent details I have not shared.`,
    introducePrompt: (name) =>
      `I want to tell you about ${name}, a project I’m working on. ` +
      `Its name is ${name} — help me capture what it is, what I’m trying to do, ` +
      `and where things stand right now.`,
  },
  family: {
    kind: 'family',
    entityType: 'character',
    sourceSurface: 'family',
    sourceLabel: CHAT_FOCUS_SOURCE_LABELS.family,
    knowledgeScope: 'how this person is related to you, that they are family, and what matters about them right now',
    icon: TreePine,
    theme: familyTheme,
    pendingIdPrefix: 'pending:character',
    copy: {
      collapsedTitle: 'A relative not in your tree yet?',
      collapsedBody:
        'Start a focused chat. Choose someone already in Character Book or introduce a new relative — LoreBook will create their Character Book entry, mark them as family, and grow their story as you talk.',
      ctaLabel: 'Add a family member in chat',
      expandedTitle: 'Add a family member in chat',
      expandedBody: 'Search Character Book first, or enter a new name to introduce a relative.',
      namePlaceholder: 'Their name',
      nameAriaLabel: 'Family member name',
      matchListAriaLabel: 'Character Book matches',
      inBookLabel: 'In Character Book',
      footerNote: 'Tell me how they’re related — parent, sibling, cousin, whatever fits. You decide what becomes part of their story.',
      introduceVerb: 'Introduce',
    },
    existingPrompt: (name) =>
      `I want to talk about ${name}. Help me capture how they’re related to me, confirm they’re family, and update anything that’s changed about them or us. Please do not invent details I have not shared.`,
    introducePrompt: (name, meta) => {
      const roleBit = meta?.rolePhrase ? ` Their role is ${meta.rolePhrase}.` : '';
      return (
        `I want to tell you about ${name}, someone in my family who isn’t in LoreBook yet. ` +
        `Their name is ${name}.${roleBit} ` +
        `I’ll tell you how they’re related to me — parent, sibling, cousin, in-law, whatever fits — please create their Character Book entry, ` +
        `mark them as family, and capture the relationship exactly as I describe it. ` +
        `Please do not invent details I have not shared.`
      );
    },
  },
};

/** Knowledge scope when filling a group roster from main chat. */
export const ORGANIZATION_ROSTER_KNOWLEDGE_SCOPE =
  'creating Character Book people, solidifying who is (and is not) affiliated with this group, and capturing group lore from what I share';

/** Prefill for Groups modal → main chat roster / affiliation session. */
export function organizationRosterChatPrompt(name: string): string {
  return (
    `I want to fill out the roster and lore for ${name}. ` +
    `Help me name the people in or around this group, create Character Book entries for anyone who isn’t in LoreBook yet, ` +
    `and solidify who is affiliated with ${name} (with roles when I know them). ` +
    `If I correct you — including that someone is NOT in the group — treat that as authoritative and update affiliation accordingly. ` +
    `Also help me describe what this group/organization is and how I’m connected. ` +
    `Please do not invent people, memberships, or details I have not shared; ask short clarifying questions when something is ambiguous.`
  );
}
