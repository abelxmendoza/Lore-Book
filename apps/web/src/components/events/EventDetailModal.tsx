import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Clock, MapPin, Users, MessageSquare, Send, Sparkles,
  Calendar, ArrowRight, ArrowLeft, Eye, Heart, Link2, FileText,
  Lightbulb, GitBranch, CheckCircle2, Quote, UserCircle2, Trash2,
  Compass,
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { UnknownField } from '../ui/UnknownField';
import { fetchJson } from '../../lib/api';
import { formatEventTime } from '../../lib/formatEventTime';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { EventConfidenceHistory } from './EventConfidenceHistory';
import { EventActionsMenu } from './EventActionsMenu';
import { EventMetaTags } from './EventMetaTags';
import { getDisplayTitle } from '../../utils/displayTitle';
import { TextWithEntityPills } from '../entity/TextWithEntityPills';
import {
  epistemicBadgeColorClass,
  epistemicHistoryTitle,
  epistemicLabel,
  formatEpistemicPercent,
} from '../../lib/epistemicLabels';
import { NarrativeProvenancePanel } from '../narrative/NarrativeProvenancePanel';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  title: string;
  summary: string | null;
  type: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone?: string | null;
  temporal_precision?: string | null;
  temporal_source?: string | null;
  temporal_status?: string | null;
  confidence: number;
  people: string[];
  locations: string[];
  activities: string[];
  source_count?: number;
  source_messages?: Array<{
    id: string;
    role: string;
    content: string;
    original_text?: string;
    created_at: string;
    session_id: string;
  }>;
  source_unit_ids?: string[];
  linked_decisions?: Array<{
    id: string;
    title: string;
    description: string;
    created_at: string;
  }>;
  linked_insights?: Array<{
    id: string;
    category: string;
    text: string;
    confidence: number;
    created_at: string;
  }>;
  confidence_history?: Array<{
    id: string;
    confidence: number;
    reason: string;
    recorded_at: string;
    metadata?: { old_confidence?: number; change_amount?: number; };
  }>;
  continuity_notes?: string[];
  causal_links?: {
    causes: Array<{
      causeEventId: string; effectEventId: string; causalType: string;
      confidence: number; causalStrength?: number; timeLagDays?: number;
      evidence: string;
      causeEvent: { id: string; title: string; summary: string | null; start_time: string; };
    }>;
    effects: Array<{
      causeEventId: string; effectEventId: string; causalType: string;
      confidence: number; causalStrength?: number; timeLagDays?: number;
      evidence: string;
      effectEvent: { id: string; title: string; summary: string | null; start_time: string; };
    }>;
  };
  impact?: {
    type: 'direct_participant' | 'indirect_affected' | 'related_person_affected' | 'observer' | 'ripple_effect';
    connectionCharacter?: string;
    connectionType?: string;
    emotionalImpact?: 'positive' | 'negative' | 'neutral' | 'mixed';
    impactIntensity: number;
    impactDescription?: string;
  };
  meaning?: {
    narratives: Array<{ account_type: string; narrative_text: string; recorded_at: string }>;
    emotions: Array<{ emotion: string; intensity: number; timestamp_offset?: number }>;
    cognitions: Array<{ cognition_type: string; content: string }>;
    identity_impacts: Array<{ impact_type: string; identity_aspect?: string }>;
  };
  story_position?: {
    arc_id?: string;
    arc_title?: string;
    arc_type?: string;
    chapter_id?: string;
    chapter_title?: string;
  } | null;
}

interface EventDetailModalProps {
  event: Event;
  onClose: () => void;
  /** Shown as breadcrumb when this modal was opened from another event. */
  breadcrumb?: string;
  /** Called after the event is deleted so the parent list can refresh. */
  onDeleted?: (id: string) => void;
}

type LinkedEventStub = { id: string; title: string; summary: string | null; start_time: string };

/** Build a minimal Event stub for modal stacking — loadEvent will fetch the rest. */
function makeEventStub(e: LinkedEventStub): Event {
  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    type: null,
    start_time: e.start_time,
    end_time: null,
    confidence: 0.7,
    people: [],
    locations: [],
    activities: [],
    source_count: 0,
  };
}

type TabKey = 'overview' | 'meaning' | 'connections' | 'evidence';

// ─── Demo mode enrichment ─────────────────────────────────────────────────────
// When an event has no real data (demo/mock mode), inject rich example content
// so every section of the modal is populated and looks alive.

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();

const DEMO_ENRICHMENT: Partial<Event> = {
  impact: {
    type: 'direct_participant',
    emotionalImpact: 'mixed',
    impactIntensity: 0.78,
    impactDescription: 'This moment challenged how you understood your own reactions under pressure — you showed up differently than you expected.',
  },
  causal_links: {
    causes: [
      {
        causeEventId: 'demo-cause-1', effectEventId: 'current',
        causalType: 'triggers', confidence: 0.85, causalStrength: 0.79,
        timeLagDays: 12,
        evidence: 'You mentioned feeling ready for a change after the previous week shifted your perspective significantly.',
        causeEvent: {
          id: 'demo-cause-1',
          title: 'The Conversation That Changed Things',
          summary: 'A late-night conversation that reframed how you were thinking about what you wanted.',
          start_time: daysAgo(40),
        },
      },
    ],
    effects: [
      {
        causeEventId: 'current', effectEventId: 'demo-effect-1',
        causalType: 'enables', confidence: 0.81, causalStrength: 0.72,
        timeLagDays: 18,
        evidence: 'Three weeks later you described taking the first concrete step — directly tracing it back to this.',
        effectEvent: {
          id: 'demo-effect-1',
          title: 'A New Direction Begins',
          summary: 'You stopped waiting for the right moment and started acting on what mattered.',
          start_time: daysAgo(10),
        },
      },
    ],
  },
  linked_decisions: [
    {
      id: 'demo-decision-1',
      title: 'Commit to showing up differently',
      description: 'You decided to stop minimizing the things that actually matter to you and start treating them with the weight they deserve.',
      created_at: daysAgo(22),
    },
  ],
  linked_insights: [
    {
      id: 'demo-insight-1',
      category: 'self-awareness',
      text: 'You function better when you have structure around ambiguity rather than avoiding it entirely.',
      confidence: 0.88,
      created_at: daysAgo(21),
    },
    {
      id: 'demo-insight-2',
      category: 'relationships',
      text: 'The people you show up for during hard moments are the ones you actually trust — your actions revealed your real values.',
      confidence: 0.83,
      created_at: daysAgo(19),
    },
  ],
  continuity_notes: [
    'This event appears at a turning point — you were actively renegotiating what you wanted from several areas of your life simultaneously.',
  ],
  confidence_history: [
    { id: 'snap-1', confidence: 0.58, reason: 'Initial detection from conversation', recorded_at: daysAgo(45), metadata: { change_amount: 0.58 } },
    { id: 'snap-2', confidence: 0.74, reason: 'Corroborated by follow-up mention 12 days later', recorded_at: daysAgo(33), metadata: { old_confidence: 0.58, change_amount: 0.16 } },
    { id: 'snap-3', confidence: 0.88, reason: 'Causal link detected — confirms significance', recorded_at: daysAgo(14), metadata: { old_confidence: 0.74, change_amount: 0.14 } },
  ],
  source_messages: [
    {
      id: 'msg-1', role: 'user', session_id: 'demo',
      content: "I've been thinking about what happened and I think it was actually more significant than I realized at the time.",
      created_at: daysAgo(40),
    },
    {
      id: 'msg-2', role: 'assistant', session_id: 'demo',
      content: 'It sounds like this event landed differently in retrospect. What changed in how you see it?',
      created_at: daysAgo(40),
    },
    {
      id: 'msg-3', role: 'user', session_id: 'demo',
      content: 'I think I was scared at the time so I minimized it. But it actually changed how I see myself in that situation.',
      created_at: daysAgo(39),
    },
  ],
  meaning: {
    narratives: [
      {
        account_type: 'at_the_time',
        narrative_text: 'I felt completely unprepared but somehow kept going. There was a moment where I almost backed out — but something made me stay. I wasn\'t ready. And I did it anyway.',
        recorded_at: daysAgo(40),
      },
      {
        account_type: 'later_interpretation',
        narrative_text: 'Looking back, that anxiety was actually productive. I was scared because it mattered. And it mattered because I genuinely cared about getting it right — not for anyone else, just for myself.',
        recorded_at: daysAgo(10),
      },
    ],
    emotions: [
      { emotion: 'anxious', intensity: 0.82, timestamp_offset: 0 },
      { emotion: 'determined', intensity: 0.65, timestamp_offset: 30 },
      { emotion: 'hopeful', intensity: 0.44, timestamp_offset: 60 },
    ],
    cognitions: [
      { cognition_type: 'doubt', content: 'Am I actually ready for this?' },
      { cognition_type: 'belief', content: 'I need to see this through, even if it doesn\'t go well.' },
      { cognition_type: 'realization', content: 'The fact that I showed up was already the hardest part.' },
    ],
    identity_impacts: [
      { impact_type: 'challenged', identity_aspect: 'capability' },
      { impact_type: 'reinforced', identity_aspect: 'resilience' },
    ],
  },
};

function enrichForDemo(event: Event): Event {
  if (!event.id.startsWith('event-')) return event;
  return {
    ...event,
    impact: event.impact ?? DEMO_ENRICHMENT.impact,
    causal_links: event.causal_links ?? DEMO_ENRICHMENT.causal_links,
    linked_decisions: event.linked_decisions ?? DEMO_ENRICHMENT.linked_decisions,
    linked_insights: event.linked_insights ?? DEMO_ENRICHMENT.linked_insights,
    continuity_notes: event.continuity_notes ?? DEMO_ENRICHMENT.continuity_notes,
    confidence_history: event.confidence_history ?? DEMO_ENRICHMENT.confidence_history,
    source_messages: event.source_messages ?? DEMO_ENRICHMENT.source_messages,
    meaning: event.meaning ?? DEMO_ENRICHMENT.meaning,
  };
}

// ─── Synthesis helpers ────────────────────────────────────────────────────────

const formatDate = (dateString: string, full = false) => {
  try {
    return format(parseISO(dateString), full ? 'EEEE, MMMM d, yyyy · h:mm a' : 'MMM d, yyyy h:mm a');
  } catch {
    return dateString;
  }
};

const formatNames = (names: string[], maxShown = 3): string => {
  if (names.length === 0) return '';
  const shown = names.slice(0, maxShown);
  const extra = names.length - maxShown;
  return extra > 0 ? `${shown.join(', ')} +${extra} more` : shown.join(', ');
};

const getOneSentence = (ev: Event): string | null => {
  if (ev.causal_links?.effects?.length) return `This event led to "${ev.causal_links.effects[0].effectEvent.title}."`;
  if (ev.causal_links?.causes?.length) return `This followed from "${ev.causal_links.causes[0].causeEvent.title}."`;
  if (ev.linked_insights?.length) {
    const t = ev.linked_insights[0].text;
    return `This moment crystallized into an insight: "${t.length > 85 ? t.slice(0, 82) + '…' : t}"`;
  }
  if (ev.linked_decisions?.length) return `This event influenced the decision: "${ev.linked_decisions[0].title}."`;
  if (ev.continuity_notes?.length) { const n = ev.continuity_notes[0]; return n.length > 140 ? n.slice(0, 137) + '…' : n; }
  if (ev.impact?.impactDescription) { const d = ev.impact.impactDescription; return d.length > 140 ? d.slice(0, 137) + '…' : d; }
  const map: Record<string, string> = {
    direct_participant: 'You were there — this moment is part of your story.',
    indirect_affected: 'This event touched your life, even without you being present.',
    related_person_affected: 'Someone close to you was at the center of this moment.',
    ripple_effect: 'The effects of this moment reached you over time.',
  };
  if (ev.impact?.type && map[ev.impact.type]) return map[ev.impact.type];
  return null;
};

type WhySignal = { label: string; text: string; border: string; bg: string; labelColor: string; linkedEvent?: LinkedEventStub; };

const getWhySignals = (ev: Event): WhySignal[] => {
  const s: WhySignal[] = [];
  ev.causal_links?.causes?.slice(0, 2).forEach(l => s.push({
    label: 'Stemmed from',
    text: l.causeEvent.title,
    border: 'border-blue-500/50', bg: 'bg-blue-500/12', labelColor: 'text-blue-400/70',
    linkedEvent: l.causeEvent,
  }));
  ev.causal_links?.effects?.slice(0, 2).forEach(l => s.push({
    label: 'Led to',
    text: l.effectEvent.title,
    border: 'border-emerald-500/50', bg: 'bg-emerald-500/12', labelColor: 'text-emerald-400/70',
    linkedEvent: l.effectEvent,
  }));
  ev.linked_insights?.slice(0, 2).forEach(i => s.push({
    label: `Insight · ${i.category}`,
    text: i.text.length > 100 ? i.text.slice(0, 97) + '…' : i.text,
    border: 'border-purple-500/50', bg: 'bg-purple-500/12', labelColor: 'text-purple-400/70',
  }));
  ev.linked_decisions?.slice(0, 1).forEach(d => s.push({
    label: 'Influenced decision',
    text: d.title,
    border: 'border-amber-500/50', bg: 'bg-amber-500/12', labelColor: 'text-amber-400/70',
  }));
  if (ev.impact?.connectionCharacter && ev.impact.connectionType) s.push({
    label: 'Character involvement',
    text: `${ev.impact.connectionCharacter} · ${ev.impact.connectionType}`,
    border: 'border-orange-500/50', bg: 'bg-orange-500/12', labelColor: 'text-orange-400/70',
  });
  ev.continuity_notes?.slice(0, 1).forEach(n => s.push({
    label: 'Part of a bigger pattern',
    text: n.length > 120 ? n.slice(0, 117) + '…' : n,
    border: 'border-teal-500/50', bg: 'bg-teal-500/12', labelColor: 'text-teal-400/70',
  }));
  return s;
};

// ─── Character avatars ────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  { bg: 'bg-blue-500/30', text: 'text-blue-200', border: 'border-blue-500/40', ring: 'ring-blue-500/20' },
  { bg: 'bg-purple-500/30', text: 'text-purple-200', border: 'border-purple-500/40', ring: 'ring-purple-500/20' },
  { bg: 'bg-emerald-500/30', text: 'text-emerald-200', border: 'border-emerald-500/40', ring: 'ring-emerald-500/20' },
  { bg: 'bg-amber-500/30', text: 'text-amber-200', border: 'border-amber-500/40', ring: 'ring-amber-500/20' },
  { bg: 'bg-rose-500/30', text: 'text-rose-200', border: 'border-rose-500/40', ring: 'ring-rose-500/20' },
  { bg: 'bg-teal-500/30', text: 'text-teal-200', border: 'border-teal-500/40', ring: 'ring-teal-500/20' },
  { bg: 'bg-orange-500/30', text: 'text-orange-200', border: 'border-orange-500/40', ring: 'ring-orange-500/20' },
  { bg: 'bg-indigo-500/30', text: 'text-indigo-200', border: 'border-indigo-500/40', ring: 'ring-indigo-500/20' },
];

const getAvatarStyle = (name: string) => AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];

const getInitials = (name: string): string => {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// ─── Meaning tab display config ───────────────────────────────────────────────

const EMOTION_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  anxious:    { bg: 'bg-amber-500/20 border-amber-500/30',   text: 'text-amber-200',   bar: 'bg-amber-400' },
  scared:     { bg: 'bg-red-500/20 border-red-500/30',       text: 'text-red-200',     bar: 'bg-red-400' },
  determined: { bg: 'bg-blue-500/20 border-blue-500/30',     text: 'text-blue-200',    bar: 'bg-blue-400' },
  hopeful:    { bg: 'bg-emerald-500/20 border-emerald-500/30', text: 'text-emerald-200', bar: 'bg-emerald-400' },
  excited:    { bg: 'bg-green-500/20 border-green-500/30',   text: 'text-green-200',   bar: 'bg-green-400' },
  sad:        { bg: 'bg-slate-500/20 border-slate-500/30',   text: 'text-slate-200',   bar: 'bg-slate-400' },
  angry:      { bg: 'bg-rose-500/20 border-rose-500/30',     text: 'text-rose-200',    bar: 'bg-rose-400' },
  proud:      { bg: 'bg-violet-500/20 border-violet-500/30', text: 'text-violet-200',  bar: 'bg-violet-400' },
  conflicted: { bg: 'bg-orange-500/20 border-orange-500/30', text: 'text-orange-200',  bar: 'bg-orange-400' },
};
const DEFAULT_EMOTION = { bg: 'bg-white/10 border-white/15', text: 'text-white/60', bar: 'bg-white/40' };
const getEmotionStyle = (e: string) => EMOTION_STYLES[e.toLowerCase()] || DEFAULT_EMOTION;

const COGNITION_CONFIG: Record<string, { label: string; color: string; symbol: string }> = {
  belief:               { label: 'You believed',  color: 'text-blue-300',    symbol: '◈' },
  insecurity_triggered: { label: 'Something this touched', color: 'text-red-300', symbol: '⚡' },
  realization:          { label: 'You realized',  color: 'text-emerald-300', symbol: '◎' },
  question:             { label: 'You questioned', color: 'text-amber-300',  symbol: '?' },
  doubt:                { label: 'You doubted',   color: 'text-orange-300',  symbol: '~' },
};
const DEFAULT_COGNITION = { label: 'Noted', color: 'text-white/60', symbol: '·' };

const IDENTITY_CONFIG: Record<string, { label: string; color: string; bg: string; symbol: string }> = {
  reinforced: { label: 'Reinforced', color: 'text-emerald-300', bg: 'bg-emerald-500/12 border-emerald-500/25', symbol: '▲' },
  challenged: { label: 'Challenged', color: 'text-amber-300',   bg: 'bg-amber-500/12 border-amber-500/25',   symbol: '⚡' },
  shifted:    { label: 'Shifted',    color: 'text-purple-300',  bg: 'bg-purple-500/12 border-purple-500/25',  symbol: '→' },
  clarified:  { label: 'Clarified',  color: 'text-blue-300',    bg: 'bg-blue-500/12 border-blue-500/25',      symbol: '◎' },
};
const DEFAULT_IDENTITY = { label: 'Affected', color: 'text-white/60', bg: 'bg-white/5 border-white/10', symbol: '·' };

const toneConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  positive: { label: 'Positive', color: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/40', dot: 'bg-emerald-400' },
  negative: { label: 'Difficult', color: 'text-red-300', bg: 'bg-red-500/15 border-red-500/40', dot: 'bg-red-400' },
  mixed: { label: 'Mixed', color: 'text-amber-300', bg: 'bg-amber-500/15 border-amber-500/40', dot: 'bg-amber-400' },
  neutral: { label: 'Neutral', color: 'text-slate-300', bg: 'bg-slate-500/15 border-slate-500/40', dot: 'bg-slate-400' },
};

// ─── "What LoreBook Learned" synthesis ───────────────────────────────────────

type LearnedItem = {
  text: string;
  source: 'insight' | 'decision' | 'causal' | 'continuity' | 'confidence' | 'character';
};

function getLearnedItems(ev: Event): LearnedItem[] {
  const items: LearnedItem[] = [];

  ev.causal_links?.effects?.forEach(link => {
    items.push({
      text: `This event ${link.causalType.replace(/_/g, ' ')} "${link.effectEvent.title}" — a clear causal chain in your story.`,
      source: 'causal',
    });
  });

  ev.causal_links?.causes?.forEach(link => {
    items.push({
      text: `This followed from "${link.causeEvent.title}" — part of a sequence that shaped this moment.`,
      source: 'causal',
    });
  });

  ev.linked_insights?.forEach(insight => {
    const short = insight.text.length > 90 ? insight.text.slice(0, 87) + '…' : insight.text;
    items.push({
      text: `An insight about your ${insight.category} emerged: "${short}"`,
      source: 'insight',
    });
  });

  ev.linked_decisions?.forEach(d => {
    items.push({
      text: `This contributed to the decision: "${d.title}"`,
      source: 'decision',
    });
  });

  ev.continuity_notes?.forEach(note => {
    items.push({ text: note, source: 'continuity' });
  });

  if (ev.impact?.connectionCharacter && ev.impact.connectionType) {
    items.push({
      text: `This event became strongly associated with ${ev.impact.connectionCharacter} (${ev.impact.connectionType}).`,
      source: 'character',
    });
  }

  if (ev.confidence >= 0.85 && ev.source_count && ev.source_count >= 3) {
    items.push({
      text: `This is now a well-supported memory (${formatEpistemicPercent(ev.confidence)}), corroborated across ${ev.source_count} conversations.`,
      source: 'confidence',
    });
  }

  return items;
}

const LEARNED_ICON_CONFIG: Record<LearnedItem['source'], { icon: string; color: string; bg: string }> = {
  causal:      { icon: '⟶', color: 'text-indigo-300', bg: 'bg-indigo-500/12 border-indigo-500/25' },
  insight:     { icon: '◈', color: 'text-purple-300', bg: 'bg-purple-500/12 border-purple-500/25' },
  decision:    { icon: '✓', color: 'text-amber-300',  bg: 'bg-amber-500/12 border-amber-500/25' },
  continuity:  { icon: '~', color: 'text-teal-300',   bg: 'bg-teal-500/12 border-teal-500/25' },
  character:   { icon: '◉', color: 'text-orange-300', bg: 'bg-orange-500/12 border-orange-500/25' },
  confidence:  { icon: '▲', color: 'text-emerald-300', bg: 'bg-emerald-500/12 border-emerald-500/25' },
};

// ─── Story position ───────────────────────────────────────────────────────────

// ─── Story Position ───────────────────────────────────────────────────────────

type StoryPositionResult = {
  /** Short label shown prominently — the arc name or causal summary */
  primary: string;
  /** Optional sub-label — the chapter name */
  secondary?: string;
  /** Whether this came from real arc/chapter data (true) or causal synthesis (false) */
  fromArc: boolean;
};

function getStoryPosition(ev: Event): StoryPositionResult | null {
  // ── Priority 1: Real arc/chapter data from the timeline system ──────────────
  // When life_arcs and chapters are defined, this is the most specific and
  // meaningful position information available. Show it first.
  const sp = ev.story_position;
  if (sp?.arc_title || sp?.chapter_title) {
    const primary = sp.arc_title ? `Part of: ${sp.arc_title}` : null;
    const secondary = sp.chapter_title ? `Chapter: ${sp.chapter_title}` : undefined;
    if (primary) return { primary, secondary, fromArc: true };
    // Chapter only, no arc
    if (secondary) return { primary: secondary, fromArc: true };
  }

  // ── Priority 2: Synthesised from causal/insight/decision data ───────────────
  // When no arc/chapter is defined, derive a positional statement from
  // the event's connections. Generic but grounded in real signals.
  const causes = ev.causal_links?.causes?.length ?? 0;
  const effects = ev.causal_links?.effects?.length ?? 0;
  const insights = ev.linked_insights?.length ?? 0;
  const decisions = ev.linked_decisions?.length ?? 0;

  if (causes > 0 && effects > 0) {
    return { primary: 'A turning point — connected to what came before and what followed.', fromArc: false };
  }
  if (effects >= 2) {
    return { primary: `Consequential — ${effects} events followed from this moment.`, fromArc: false };
  }
  if (effects === 1 && decisions > 0) {
    return { primary: 'This moment led to a decision and set something in motion.', fromArc: false };
  }
  if (causes > 0) {
    return { primary: 'Part of a sequence — this moment followed from an earlier one.', fromArc: false };
  }
  if (insights >= 2) {
    return { primary: `Reflective — ${insights} insights trace back to this moment.`, fromArc: false };
  }
  if (decisions > 0) {
    return { primary: 'This moment influenced a decision you made.', fromArc: false };
  }
  return null;
}

// ─── Chat types & helpers ─────────────────────────────────────────────────────

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  meta?: {
    uncertainty_level?: string;
    confidence_level?: string;
    why?: string;
    confidence_humanized?: string;
  };
};

/** Lorekeeper's first message — synthesised from whatever is known about the event. */
function generateOpeningMessage(ev: Event): string {
  const parts: string[] = [];
  const sources = ev.source_count || 0;
  const pct = Math.round(ev.confidence * 100);

  if (sources > 0) {
    parts.push(`I've seen this event come up in ${sources} conversation${sources === 1 ? '' : 's'}.`);
  }

  if (pct >= 75) {
    parts.push(`With ${formatEpistemicPercent(ev.confidence)}, this is a well-documented memory.`);
  } else if (pct >= 50) {
    parts.push(`${epistemicLabel(ev.confidence)} — there's room to add more detail (${formatEpistemicPercent(ev.confidence)}).`);
  } else {
    parts.push(`Still uncertain (${formatEpistemicPercent(ev.confidence)}) — anything you share helps clarify it.`);
  }

  if (ev.causal_links?.effects?.length) {
    parts.push(`It looks like this led to "${ev.causal_links.effects[0].effectEvent.title}".`);
  } else if (ev.causal_links?.causes?.length) {
    parts.push(`This seems to have followed from "${ev.causal_links.causes[0].causeEvent.title}".`);
  }

  if (ev.linked_insights?.length) {
    parts.push(`One insight about your ${ev.linked_insights[0].category} came from this.`);
  }

  if (ev.people.length > 0) {
    const names = ev.people.slice(0, 2).join(' and ');
    const extra = ev.people.length > 2 ? ` and ${ev.people.length - 2} others` : '';
    parts.push(`${names}${extra} ${ev.people.length === 1 ? 'was' : 'were'} there.`);
  }

  parts.push('What would you like to explore or add?');
  return parts.join(' ');
}

type ChatEntity = { name: string; kind: 'person' | 'location' | 'event' };

function buildEntityList(ev: Event): ChatEntity[] {
  const entities: ChatEntity[] = [];
  ev.people.forEach(p => { if (p.length >= 3) entities.push({ name: p, kind: 'person' }); });
  ev.locations.forEach(l => { if (l.length >= 4) entities.push({ name: l, kind: 'location' }); });
  ev.causal_links?.causes?.forEach(c => entities.push({ name: c.causeEvent.title, kind: 'event' }));
  ev.causal_links?.effects?.forEach(e => entities.push({ name: e.effectEvent.title, kind: 'event' }));
  return entities.sort((a, b) => b.name.length - a.name.length); // longest first to avoid partial matches
}

function renderWithChips(text: string, entities: ChatEntity[]): React.ReactNode {
  if (!entities.length) return <span>{text}</span>;

  const mentions = entities.map((entity, index) => ({
    id: `${entity.kind}-${index}-${entity.name}`,
    name: entity.name,
    type:
      entity.kind === 'location'
        ? ('location' as const)
        : entity.kind === 'event'
          ? ('event' as const)
          : ('character' as const),
    status: 'confirmed' as const,
  }));

  return <TextWithEntityPills text={text} entities={mentions} />;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const EventDetailModal: React.FC<EventDetailModalProps> = ({ event, onClose, breadcrumb, onDeleted }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteEvent = async () => {
    if (deleting) return;
    if (!window.confirm('Delete this event? This can’t be undone.')) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/conversation/events/${event.id}`, { method: 'DELETE' });
      onDeleted?.(event.id);
      onClose();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to delete event.');
      setDeleting(false);
    }
  };
  const [eventData, setEventData] = useState<Event>(() => enrichForDemo(event));
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [linkedEvent, setLinkedEvent] = useState<LinkedEventStub | null>(null);
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  // Attendance derived from the source conversation's cast when the event
  // record itself has no people — labeled as derived, never fabricated.
  const [derivedAttendees, setDerivedAttendees] = useState<
    Array<{ entityId: string | null; name: string; role: string; firstSeenRef?: string | null }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  // Prevent chat history being fetched more than once per modal open
  const chatLoadedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadEvent(); }, [event.id]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (!event.id || eventData.people.length > 0) {
      setDerivedAttendees([]);
      return;
    }
    let cancelled = false;
    fetchJson<{
      success: boolean;
      source: string;
      attendees: Array<{ entityId: string | null; name: string; role: string; firstSeenRef?: string | null }>;
    }>(`/api/conversation/events/${event.id}/roster`)
      .then((res) => {
        if (!cancelled && res.source === 'derived_from_thread_cast') {
          setDerivedAttendees(res.attendees ?? []);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [event.id, eventData.people.length]);

  const primeChat = (ev: Event) => {
    setChatMessages(prev =>
      prev.length === 0
        ? [{ role: 'assistant', content: generateOpeningMessage(ev), timestamp: new Date() }]
        : prev
    );
  };

  const loadChatHistory = async (ev: Event) => {
    if (chatLoadedRef.current) return;
    chatLoadedRef.current = true;
    setChatLoading(true);
    try {
      const result = await fetchJson<{
        success: boolean;
        messages: Array<{ id: string; role: string; content: string; created_at: string }>;
        thread_id: string | null;
      }>(`/api/conversation/events/${event.id}/chat-history`);

      if (result.success && result.messages.length > 0) {
        setChatMessages(
          result.messages.map(m => ({
            role: (m.role === 'user' ? 'user' : 'assistant') as ChatMessage['role'],
            content: m.content,
            timestamp: new Date(m.created_at),
          }))
        );
      } else {
        // No prior conversation — insert the opening primer
        primeChat(ev);
      }
    } catch {
      // Chat history is optional — fall back to primer
      primeChat(ev);
    } finally {
      setChatLoading(false);
    }
  };

  const loadEvent = async () => {
    if (event.id.startsWith('event-')) {
      const enriched = enrichForDemo(event);
      setEventData(enriched);
      primeChat(enriched); // demo events have no real history
      return;
    }
    try {
      const [eventResult] = await Promise.all([
        fetchJson<{ success: boolean; event: Event }>(`/api/conversation/events/${event.id}`),
        loadChatHistory(event as Event), // fire in parallel with event load
      ]);
      if (eventResult.success) setEventData(eventResult.event);

      try {
        const causal = await fetchJson<any>(`/api/conversation/events/${event.id}/causal-links`);
        if (causal.success) {
          setEventData(prev => ({ ...prev, causal_links: { causes: causal.causes || [], effects: causal.effects || [] } }));
        }
      } catch { /* optional */ }
    } catch {
      const fallback = enrichForDemo(event);
      setEventData(fallback);
      primeChat(fallback);
    }
  };

  const handleChatMessage = async () => {
    if (!chatInput.trim() || sending) return;
    const msg = chatInput.trim();
    setChatInput('');
    setSending(true);
    setChatMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }]);
    try {
      const result = await fetchJson<{ success: boolean; response: string; meta?: any }>(
        `/api/conversation/events/${event.id}/chat`,
        { method: 'POST', body: JSON.stringify({ message: msg }) }
      );
      if (result.success && result.response) {
        const newMsgs: ChatMessage[] = [
          { role: 'assistant', content: result.response, timestamp: new Date(), meta: result.meta },
        ];
        // Emit a system row when memory was updated
        if (result.meta?.confidence_humanized) {
          newMsgs.push({
            role: 'system',
            content: `Memory updated · ${result.meta.confidence_humanized}`,
            timestamp: new Date(),
          });
        }
        setChatMessages(prev => [...prev, ...newMsgs]);
        setTimeout(() => loadEvent(), 1000);
      }
    } catch {
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const oneSentence = getOneSentence(eventData);
  const storyPosition = getStoryPosition(eventData);
  const whySignals = getWhySignals(eventData);
  const tone = eventData.impact?.emotionalImpact ? toneConfig[eventData.impact.emotionalImpact] : null;
  const peopleDisplay = formatNames(eventData.people, 4);
  const locationsDisplay = formatNames(eventData.locations, 3);
  const displayTitle = getDisplayTitle({
    title: eventData.title,
    summary: eventData.summary,
    date: eventData.start_time,
    fallbackNoun: 'Event',
    people: eventData.people,
    locations: eventData.locations,
  });

  // Memory strength — composite score 0-100
  const memoryStrength = Math.min(100, Math.round(
    (eventData.confidence * 40) +
    Math.min(30, (eventData.source_count || 0) * 5) +
    Math.min(20, ((eventData.causal_links?.causes?.length || 0) + (eventData.causal_links?.effects?.length || 0)) * 10) +
    Math.min(10, (eventData.linked_insights?.length || 0) * 5)
  ));

  const memoryStrengthLabel = memoryStrength >= 75 ? 'Well documented' : memoryStrength >= 45 ? 'Familiar' : 'Still learning';
  const memoryStrengthColor = memoryStrength >= 75 ? 'bg-emerald-400' : memoryStrength >= 45 ? 'bg-amber-400' : 'bg-white/30';

  // Connection count for tab badge
  const connectionsCount =
    (eventData.causal_links?.causes?.length || 0) +
    (eventData.causal_links?.effects?.length || 0) +
    (eventData.linked_decisions?.length || 0) +
    (eventData.linked_insights?.length || 0) +
    (eventData.impact?.connectionCharacter ? 1 : 0);

  // Event age
  let eventAge = '';
  try { if (eventData.start_time) eventAge = formatDistanceToNow(parseISO(eventData.start_time), { addSuffix: true }); } catch { /* noop */ }

  // Header gradient — emotional tone first, event type as fallback
  const getTypeGradient = (type: string | null) => {
    if (!type) return 'from-indigo-900/30 via-slate-950 to-slate-950';
    const t = type.toLowerCase();
    if (t.includes('work') || t.includes('meet')) return 'from-blue-900/40 via-slate-950 to-slate-950';
    if (t.includes('social') || t.includes('party') || t.includes('concert')) return 'from-rose-900/35 via-slate-950 to-slate-950';
    if (t.includes('travel') || t.includes('trip')) return 'from-teal-900/40 via-slate-950 to-slate-950';
    if (t.includes('health') || t.includes('sport') || t.includes('gym')) return 'from-green-900/40 via-slate-950 to-slate-950';
    if (t.includes('family')) return 'from-pink-900/35 via-slate-950 to-slate-950';
    if (t.includes('education') || t.includes('learn')) return 'from-violet-900/40 via-slate-950 to-slate-950';
    return 'from-indigo-900/30 via-slate-950 to-slate-950';
  };

  const toneGradient: Record<string, string> = {
    positive: 'from-emerald-900/40 via-slate-950 to-slate-950',
    negative: 'from-red-900/35 via-slate-950 to-slate-950',
    mixed: 'from-amber-900/35 via-slate-950 to-slate-950',
    neutral: 'from-slate-800/30 via-slate-950 to-slate-950',
  };
  const headerGradient = eventData.impact?.emotionalImpact
    ? toneGradient[eventData.impact.emotionalImpact]
    : getTypeGradient(eventData.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div className="relative w-full max-w-4xl max-h-[92vh] rounded-xl shadow-2xl shadow-primary/15 flex flex-col overflow-hidden border border-white/10 bg-[linear-gradient(160deg,#0d0d1f_0%,#080812_40%,#07070e_100%)]">

        {/* Breadcrumb — shown when navigated here from another event */}
        {breadcrumb && (
          <div className="flex items-center gap-2 px-5 py-2 bg-white/4 border-b border-white/8 text-[11px] text-white/40 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 hover:text-primary/80 transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              <span className="truncate max-w-[160px]">{breadcrumb}</span>
            </button>
            <span className="text-white/20">›</span>
            <span className="text-white/60 truncate max-w-[200px]">{displayTitle}</span>
          </div>
        )}

        {/* Top accent line — colored by emotional tone */}
        <div className={`h-0.5 flex-shrink-0 bg-gradient-to-r ${
          eventData.impact?.emotionalImpact === 'positive' ? 'from-emerald-400 via-teal-500 to-transparent' :
          eventData.impact?.emotionalImpact === 'negative' ? 'from-red-400 via-rose-500 to-transparent' :
          eventData.impact?.emotionalImpact === 'mixed' ? 'from-amber-400 via-orange-500 to-transparent' :
          'from-primary via-purple-500 to-transparent'
        }`} />

        {/* ── Header ── */}
        <div className={`flex-shrink-0 bg-gradient-to-b ${headerGradient} p-5 sm:p-6 border-b border-white/8`}>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              {eventData.type && (
                <p className="text-[11px] font-medium text-white/40 uppercase tracking-widest mb-1">
                  {eventData.type}
                </p>
              )}
              <h2 className="text-xl sm:text-2xl font-bold leading-tight text-white">{displayTitle}</h2>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Open in chronology"
                title="Open in chronology"
                onClick={() => {
                  onClose();
                  const params = new URLSearchParams({ view: 'events' });
                  if (eventData.start_time) {
                    try {
                      params.set('q', format(parseISO(eventData.start_time), 'yyyy-MM-dd'));
                    } catch {
                      /* ignore bad dates */
                    }
                  }
                  navigate(`/timeline?${params.toString()}`);
                }}
                className="text-white/45 hover:text-primary hover:bg-primary/10"
              >
                <Calendar className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline text-xs">Chronology</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Open narrative anchors"
                title="Open narrative anchors"
                onClick={() => {
                  onClose();
                  navigate('/narrative-anchors');
                }}
                className="text-white/45 hover:text-cyan-200 hover:bg-cyan-500/10"
              >
                <Compass className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline text-xs">Anchors</span>
              </Button>
              {onDeleted && (
                <Button
                  type="button"
                  onClick={handleDeleteEvent}
                  disabled={deleting}
                  variant="ghost"
                  size="sm"
                  aria-label="Delete event"
                  title="Delete event"
                  className="text-white/45 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <EventActionsMenu eventId={eventData.id} onOverrideApplied={loadEvent} />
              <Button type="button" onClick={onClose} variant="ghost" size="sm" aria-label="Close"
                className="text-white/50 hover:text-white hover:bg-white/10">
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* In One Sentence — the most prominent header element */}
          {oneSentence && (
            <div className="bg-white/5 border border-white/12 rounded-lg px-4 py-3 mb-2">
              <p className="text-sm text-white/85 italic leading-relaxed">
                {oneSentence}
              </p>
            </div>
          )}

          {/* Story position — where this sits in the larger narrative */}
          {storyPosition && (
            <div className="mb-3 pl-1">
              {storyPosition.fromArc ? (
                /* Arc/chapter data: use a more prominent two-line display */
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs font-semibold text-primary/70 flex items-center gap-1.5">
                    <span>◈</span>
                    {storyPosition.primary}
                  </p>
                  {storyPosition.secondary && (
                    <p className="text-[11px] text-white/40 pl-4">{storyPosition.secondary}</p>
                  )}
                </div>
              ) : (
                /* Causal synthesis fallback: single muted line */
                <p className="text-xs text-white/40 flex items-center gap-1.5">
                  <span className="text-primary/35">◈</span>
                  {storyPosition.primary}
                </p>
              )}
            </div>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/45">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-white/30" />
              <span>{formatEventTime(eventData)}</span>
              {eventAge && (
                <span className="text-white/30">·</span>
              )}
              {eventAge && (
                <span className="text-white/40 italic">{eventAge}</span>
              )}
            </div>
            {peopleDisplay && (
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400/50" />
                <span className="text-blue-300/70">{peopleDisplay}</span>
              </div>
            )}
            {locationsDisplay && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400/50" />
                <span className="text-emerald-300/70">{locationsDisplay}</span>
              </div>
            )}
            {tone && (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs ${tone.bg} ${tone.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                {tone.label}
              </div>
            )}
          </div>

          {/* Memory strength bar */}
          <div className="flex items-center gap-3 mt-3">
            <span className="text-[10px] text-white/35 uppercase tracking-wider shrink-0">Memory</span>
            <div className="flex-1 h-1 rounded-full bg-white/8 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${memoryStrengthColor}`}
                style={{ width: `${memoryStrength}%` }}
              />
            </div>
            <span className={`text-[10px] font-semibold shrink-0 ${
              memoryStrength >= 75 ? 'text-emerald-400' : memoryStrength >= 45 ? 'text-amber-400' : 'text-white/35'
            }`}>
              {memoryStrengthLabel}
            </span>
          </div>

          <EventMetaTags eventId={eventData.id} />
        </div>

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-5 sm:px-6 pt-2 border-b border-white/8 bg-black/20 overflow-x-auto scrollbar-hide">
            <TabsList className="gap-0.5 bg-transparent w-max min-w-full">
              <TabsTrigger value="overview"
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white/8 data-[state=active]:text-white data-[state=inactive]:text-white/40">
                <Eye className="w-3.5 h-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="meaning"
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white/8 data-[state=active]:text-white data-[state=inactive]:text-white/40">
                <Heart className="w-3.5 h-3.5" /> Meaning
              </TabsTrigger>
              <TabsTrigger value="connections"
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white/8 data-[state=active]:text-white data-[state=inactive]:text-white/40">
                <Link2 className="w-3.5 h-3.5" /> Connections
                {connectionsCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold rounded-full bg-primary/30 text-primary leading-none">
                    {connectionsCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="evidence"
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white/8 data-[state=active]:text-white data-[state=inactive]:text-white/40">
                <FileText className="w-3.5 h-3.5" /> Sources
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ══ OVERVIEW ══ */}
            <TabsContent value="overview" className="mt-0 p-5 sm:p-6 space-y-6">

              {/* Why This Moment Matters */}
              {whySignals.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/65 uppercase tracking-widest mb-3">
                    Why This Moment Matters
                  </h3>
                  <div className="space-y-2">
                    {whySignals.map((sig, idx) => (
                      <div key={idx} className={`flex items-start gap-3 pl-3 pr-4 py-3 rounded-lg border-l-[3px] ${sig.border} ${sig.bg}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${sig.labelColor}`}>
                            {sig.label}
                          </p>
                          {sig.linkedEvent ? (
                            <button
                              type="button"
                              onClick={() => setLinkedEvent(sig.linkedEvent!)}
                              className="text-sm text-white/90 leading-snug text-left hover:text-white transition-colors group/why flex items-center gap-1.5"
                            >
                              {sig.text}
                              <ArrowRight className="w-3 h-3 opacity-0 group-hover/why:opacity-50 transition-opacity flex-shrink-0" />
                            </button>
                          ) : (
                            <p className="text-sm text-white/90 leading-snug">{sig.text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── What LoreBook Learned ── */}
              {(() => {
                const items = getLearnedItems(eventData);
                if (items.length === 0) return null;
                return (
                  <section>
                    <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <span className="text-primary/70">◈</span>
                      What LoreBook Learned
                    </h3>
                    <div className="space-y-2">
                      {items.map((item, idx) => {
                        const cfg = LEARNED_ICON_CONFIG[item.source];
                        return (
                          <div key={idx} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.bg}`}>
                            <span className={`text-sm font-bold mt-0.5 flex-shrink-0 leading-none ${cfg.color}`} aria-hidden>
                              {cfg.icon}
                            </span>
                            <p className={`text-sm leading-relaxed ${cfg.color} opacity-90`}>{item.text}</p>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* ── Summary ── */}
              {eventData.summary ? (
                <section>
                  <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Quote className="w-3.5 h-3.5 text-primary/60" />
                    Summary
                  </h3>
                  <div className="relative bg-gradient-to-br from-primary/8 via-white/3 to-white/2 border border-primary/20 rounded-xl px-5 py-4">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/60 via-primary/30 to-transparent rounded-l-xl" />
                    <p className="text-sm text-white/90 leading-relaxed">{eventData.summary}</p>
                  </div>
                </section>
              ) : (
                <section>
                  <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Quote className="w-3.5 h-3.5 text-primary/60" />
                    Summary
                  </h3>
                  <UnknownField label="What happened" prompt={`About the event "${displayTitle}": `} />
                </section>
              )}

              {/* ── Characters in this Story ── */}
              {eventData.people.length === 0 && derivedAttendees.length > 0 && (
                <section data-testid="event-derived-attendance">
                  <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <UserCircle2 className="w-3.5 h-3.5 text-blue-400/70" />
                    Who was there
                    <span className="text-[9px] font-normal text-white/25 normal-case tracking-normal">
                      from the conversation this event came from
                    </span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {derivedAttendees.map((a) => {
                      const style = getAvatarStyle(a.name);
                      return (
                        <span
                          key={a.entityId ?? a.name}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${style.bg} ${style.text} ${style.border}`}
                          title={a.firstSeenRef ? `first seen #${a.firstSeenRef}` : undefined}
                        >
                          {a.name}
                          {a.role === 'main' && <span className="text-[9px] opacity-70">main</span>}
                        </span>
                      );
                    })}
                  </div>
                </section>
              )}
              {eventData.people.length === 0 && derivedAttendees.length === 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <UserCircle2 className="w-3.5 h-3.5 text-blue-400/70" />
                    Characters in this Story
                  </h3>
                  <UnknownField label="Who was there" prompt={`Who was at "${displayTitle}": `} />
                </section>
              )}
              {eventData.people.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <UserCircle2 className="w-3.5 h-3.5 text-blue-400/70" />
                    Characters in this Story
                    <span className="text-[9px] font-normal text-white/25 normal-case tracking-normal">tap to see more</span>
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {eventData.people.map(person => {
                      const style = getAvatarStyle(person);
                      const initials = getInitials(person);
                      const isConnection = person === eventData.impact?.connectionCharacter;
                      const isExpanded = expandedPerson === person;
                      return (
                        <div key={person} className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setExpandedPerson(isExpanded ? null : person)}
                            className={`
                              w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold text-sm
                              transition-all duration-200 hover:scale-110 hover:shadow-lg
                              ${style.bg} ${style.text} ${style.border}
                              ${isConnection ? 'ring-2 ring-offset-1 ring-offset-black ' + style.ring : ''}
                              ${isExpanded ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-black scale-110' : ''}
                            `}
                            aria-label={`View ${person}`}
                          >
                            {initials}
                          </button>
                          <span className={`text-[10px] text-center leading-tight max-w-[56px] truncate transition-colors ${isExpanded ? 'text-primary/80' : 'text-white/65'}`}>
                            {person}
                          </span>
                          {isConnection && !isExpanded && (
                            <span className="text-[9px] text-orange-300/60 text-center leading-tight">
                              {eventData.impact?.connectionType || 'connected'}
                            </span>
                          )}

                          {/* Inline expansion card */}
                          {isExpanded && (
                            <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
                              onClick={() => setExpandedPerson(null)}>
                              <div
                                className="w-full max-w-xs bg-[#0d0d1f] border border-white/15 rounded-2xl p-5 shadow-2xl"
                                onClick={e => e.stopPropagation()}
                              >
                                {/* Avatar + name */}
                                <div className="flex items-center gap-3 mb-4">
                                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold text-base flex-shrink-0 ${style.bg} ${style.text} ${style.border}`}>
                                    {initials}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-white">{person}</p>
                                    {isConnection && (
                                      <p className="text-xs text-orange-300/70 mt-0.5">
                                        {eventData.impact?.connectionType || 'connected to this event'}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedPerson(null)}
                                    className="ml-auto text-white/30 hover:text-white/70 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Context */}
                                <div className="space-y-2 mb-4">
                                  <p className="text-xs text-white/50">
                                    Present at this event
                                    {eventData.people.length > 1 && (
                                      <> alongside {eventData.people.filter(p => p !== person).slice(0, 2).join(' and ')}</>
                                    )}.
                                  </p>
                                  {eventData.activities.length > 0 && (
                                    <p className="text-xs text-white/40">
                                      Activities: {eventData.activities.slice(0, 3).join(', ')}
                                    </p>
                                  )}
                                  {isConnection && eventData.impact?.impactDescription && (
                                    <p className="text-xs text-white/55 italic border-l-2 border-orange-500/30 pl-2">
                                      "{eventData.impact.impactDescription.slice(0, 100)}{eventData.impact.impactDescription.length > 100 ? '…' : ''}"
                                    </p>
                                  )}
                                </div>

                                {/* Navigate to characters */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    window.dispatchEvent(new CustomEvent('navigate', { detail: { surface: 'characters' } }));
                                    setExpandedPerson(null);
                                  }}
                                  className="w-full text-center text-xs text-primary/70 hover:text-primary transition-colors py-2 border border-primary/20 rounded-lg hover:bg-primary/8"
                                >
                                  Open Characters →
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Places · When ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <section>
                  <h3 className="text-xs font-bold text-emerald-400/70 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5" /> Places
                  </h3>
                  {eventData.locations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {eventData.locations.map(l => (
                        <Badge key={l} variant="outline"
                          className="text-xs bg-emerald-500/15 text-emerald-200 border-emerald-500/35 hover:bg-emerald-500/25 transition-colors">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <UnknownField label="Where" prompt={`The event "${displayTitle}" happened at `} />
                  )}
                </section>
                <section>
                  <h3 className="text-xs font-bold text-white/55 uppercase tracking-widest mb-2.5 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> When
                  </h3>
                  <p className="text-sm text-white/85">{formatEventTime(eventData, { full: true })}</p>
                  {eventData.end_time && (
                    <p className="text-xs text-white/45 mt-1">until {formatDate(eventData.end_time)}</p>
                  )}
                </section>
              </div>

              {/* ── Activities ── */}
              {eventData.activities && eventData.activities.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/55 uppercase tracking-widest mb-2.5">
                    Activities
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {eventData.activities.map(a => (
                      <Badge key={a} variant="outline"
                        className="text-xs bg-primary/15 text-primary border-primary/35 hover:bg-primary/25 transition-colors font-medium">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Talk About This Moment ── */}
              <section className="border-t border-white/8 pt-5">
                {/* Section header with entity context */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="text-xs font-bold text-white/65 uppercase tracking-widest flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-primary/60" />
                    Talk About This Moment
                  </h3>
                  {/* Context chips — what Lorekeeper sees */}
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {eventData.people.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300/70 border border-blue-500/20">
                        {eventData.people.length} {eventData.people.length === 1 ? 'person' : 'people'}
                      </span>
                    )}
                    {eventData.locations.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300/70 border border-emerald-500/20">
                        {eventData.locations[0]}
                      </span>
                    )}
                    {(eventData.causal_links?.causes?.length || eventData.causal_links?.effects?.length) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300/70 border border-indigo-500/20">
                        causal links
                      </span>
                    )}
                  </div>
                </div>

                {/* History loading skeleton */}
                {chatLoading && (
                  <div className="flex items-end gap-2.5 mb-4">
                    <div className="w-7 h-7 rounded-full bg-primary/15 animate-pulse flex-shrink-0" />
                    <div className="space-y-2">
                      <div className="h-3 w-48 bg-white/8 rounded-full animate-pulse" />
                      <div className="h-3 w-32 bg-white/6 rounded-full animate-pulse" />
                    </div>
                  </div>
                )}

                {/* Message thread */}
                <div className="space-y-1 mb-4 max-h-80 overflow-y-auto pr-1 scroll-smooth">
                  {chatMessages.map((msg, idx) => {
                    // ── System row ──────────────────────────────────────────
                    if (msg.role === 'system') {
                      return (
                        <div key={idx} className="flex items-center gap-3 py-2">
                          <div className="flex-1 h-px bg-white/8" />
                          <span className="text-[10px] text-white/35 font-medium shrink-0 italic">{msg.content}</span>
                          <div className="flex-1 h-px bg-white/8" />
                        </div>
                      );
                    }

                    // ── User message ─────────────────────────────────────────
                    if (msg.role === 'user') {
                      return (
                        <div key={idx} className="flex justify-end pt-1.5">
                          <div className="max-w-[78%] flex flex-col items-end gap-1">
                            <div className="bg-primary/25 border border-primary/35 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-white/90 leading-relaxed">
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            {msg.timestamp && (
                              <span className="text-[9px] text-white/25 pr-1">
                                {format(msg.timestamp, 'h:mm a')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // ── Lorekeeper message ────────────────────────────────────
                    const entities = buildEntityList(eventData);
                    return (
                      <div key={idx} className="flex items-end gap-2.5 pt-1.5">
                        {/* Avatar */}
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 border border-primary/30 flex items-center justify-center flex-shrink-0 mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-primary/80" />
                        </div>
                        <div className="max-w-[78%] flex flex-col gap-1">
                          <p className="text-[9px] text-white/30 font-medium uppercase tracking-wider pl-0.5">Lorekeeper</p>
                          <div className="bg-white/7 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-white/85 leading-relaxed">
                            <p className="whitespace-pre-wrap">
                              {renderWithChips(msg.content, entities)}
                            </p>
                          </div>
                          {msg.meta?.why && (
                            <p className="text-[9px] text-white/30 italic pl-1">{msg.meta.why}</p>
                          )}
                          {msg.timestamp && (
                            <span className="text-[9px] text-white/25 pl-1">
                              {format(msg.timestamp, 'h:mm a')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator */}
                  {sending && (
                    <div className="flex items-end gap-2.5 pt-1.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 border border-primary/30 flex items-center justify-center flex-shrink-0 mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-primary/80" />
                      </div>
                      <div className="bg-white/7 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Suggested prompts — shown while no user message sent yet */}
                {!chatMessages.some(m => m.role === 'user') && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[
                      'What led up to this?',
                      'How did this make you feel?',
                      'What happened after?',
                      'Who else was involved?',
                    ].map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setChatInput(q)}
                        className="text-xs px-3 py-1.5 rounded-full border border-primary/20 bg-primary/8 text-primary/70 hover:bg-primary/18 hover:border-primary/40 hover:text-primary transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input bar */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <Input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatMessage(); }
                      }}
                      placeholder="Add context, correct a detail, or ask a question…"
                      className="w-full text-sm bg-white/5 border-white/15 focus:border-primary/50 placeholder:text-white/25 rounded-xl"
                      disabled={sending}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleChatMessage}
                    disabled={!chatInput.trim() || sending}
                    size="sm"
                    className="h-9 px-3 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary rounded-xl flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </section>
            </TabsContent>

            {/* ══ MEANING ══ */}
            <TabsContent value="meaning" className="mt-0 p-5 sm:p-6 space-y-6">

              {/* ── In This Moment (at_the_time narrative) ── */}
              {(() => {
                const atTheTime = eventData.meaning?.narratives.find(n => n.account_type === 'at_the_time');
                if (!atTheTime) return null;
                return (
                  <section>
                    <h3 className="text-xs font-bold text-rose-400/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Heart className="w-3.5 h-3.5" /> In This Moment
                    </h3>
                    <div className="relative bg-gradient-to-br from-rose-900/20 via-white/3 to-white/2 border border-rose-500/20 rounded-xl px-5 py-4">
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-rose-400/60 via-rose-400/30 to-transparent rounded-l-xl" />
                      <p className="text-sm text-white/88 leading-relaxed italic">"{atTheTime.narrative_text}"</p>
                      <p className="text-[10px] text-white/35 mt-2">
                        at the time · {format(parseISO(atTheTime.recorded_at), 'MMMM d, yyyy')}
                      </p>
                    </div>
                  </section>
                );
              })()}

              {/* ── Emotions ── */}
              {eventData.meaning?.emotions && eventData.meaning.emotions.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/65 uppercase tracking-widest mb-3">
                    What You Felt
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {eventData.meaning.emotions.map((em, idx) => {
                      const style = getEmotionStyle(em.emotion);
                      return (
                        <div key={idx} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${style.bg}`}>
                          <div className="flex flex-col gap-1 min-w-[60px]">
                            <span className={`text-xs font-semibold capitalize ${style.text}`}>{em.emotion}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                                <div className={`h-full rounded-full ${style.bar}`}
                                  style={{ width: `${Math.round(em.intensity * 100)}%` }} />
                              </div>
                              <span className="text-[9px] text-white/40">{Math.round(em.intensity * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Cognitions ── */}
              {eventData.meaning?.cognitions && eventData.meaning.cognitions.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/65 uppercase tracking-widest mb-3">
                    What Went Through Your Mind
                  </h3>
                  <div className="space-y-2">
                    {eventData.meaning.cognitions.map((cog, idx) => {
                      const cfg = COGNITION_CONFIG[cog.cognition_type] || DEFAULT_COGNITION;
                      return (
                        <div key={idx} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white/4 border border-white/8">
                          <span className={`text-sm font-bold flex-shrink-0 mt-0.5 ${cfg.color}`}>{cfg.symbol}</span>
                          <div>
                            <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${cfg.color} opacity-70`}>
                              {cfg.label}
                            </p>
                            <p className="text-sm text-white/85 leading-snug">"{cog.content}"</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Identity impacts ── */}
              {eventData.meaning?.identity_impacts && eventData.meaning.identity_impacts.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-white/65 uppercase tracking-widest mb-3">
                    How It Landed
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {eventData.meaning.identity_impacts.map((impact, idx) => {
                      const cfg = IDENTITY_CONFIG[impact.impact_type] || DEFAULT_IDENTITY;
                      return (
                        <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${cfg.bg}`}>
                          <span className={`text-xs font-bold ${cfg.color}`}>{cfg.symbol}</span>
                          <div>
                            <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                            {impact.identity_aspect && (
                              <span className="text-[10px] text-white/40 ml-1.5">your {impact.identity_aspect}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Reflection Timeline — Looking Back (later_interpretation) ── */}
              {(() => {
                const laterReflections = eventData.meaning?.narratives
                  .filter(n => n.account_type === 'later_interpretation')
                  .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
                if (!laterReflections?.length) return null;
                return (
                  <section>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 h-px bg-white/8" />
                      <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest shrink-0">
                        Looking Back
                      </h3>
                      <div className="flex-1 h-px bg-white/8" />
                    </div>
                    <div className="space-y-3">
                      {laterReflections.map((reflection, idx) => (
                        <div key={idx} className="relative bg-gradient-to-br from-indigo-900/20 via-white/3 to-white/2 border border-indigo-500/20 rounded-xl px-5 py-4">
                          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-400/60 via-indigo-400/30 to-transparent rounded-l-xl" />
                          <p className="text-sm text-white/85 leading-relaxed italic">"{reflection.narrative_text}"</p>
                          <p className="text-[10px] text-white/35 mt-2">
                            later reflection · {format(parseISO(reflection.recorded_at), 'MMMM d, yyyy')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })()}

              {/* ── Continuity + personal significance ── */}
              {eventData.continuity_notes && eventData.continuity_notes.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-teal-400/80 uppercase tracking-widest mb-2">
                    Part of a Bigger Picture
                  </h3>
                  <div className="space-y-2">
                    {eventData.continuity_notes.map((note, idx) => (
                      <div key={idx} className="border-l-2 border-teal-500/40 bg-teal-500/8 pl-4 py-2 pr-3 rounded-r-lg">
                        <p className="text-sm text-teal-100/80 italic leading-relaxed">{note}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty state — only if truly no meaning data at all */}
              {!eventData.meaning?.narratives?.length &&
               !eventData.meaning?.emotions?.length &&
               !eventData.meaning?.cognitions?.length &&
               !eventData.continuity_notes?.length && (
                <div className="py-10 text-center">
                  <Heart className="w-8 h-8 mx-auto mb-3 text-white/10" />
                  <p className="text-sm text-white/50">Talk about this moment to begin building its meaning layer.</p>
                  <p className="text-xs text-white/30 mt-1">
                    As you reflect on this event in conversation, LoreBook will surface what you felt, what you thought, and how your understanding evolved.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ══ CONNECTIONS ══ */}
            <TabsContent value="connections" className="mt-0 p-5 sm:p-6 space-y-6">

              {/* Causal chain */}
              {(eventData.causal_links?.causes?.length || eventData.causal_links?.effects?.length) ? (
                <section>
                  <h3 className="text-xs font-bold text-indigo-400/80 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" /> How This Happened
                  </h3>

                  {eventData.causal_links!.causes.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-400/60 mb-2">
                        <ArrowLeft className="w-3 h-3" /> Caused by
                      </div>
                      <div className="space-y-2">
                        {eventData.causal_links!.causes.map((link, idx) => (
                          <div key={idx} className="border border-blue-500/25 bg-blue-500/8 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              {link.timeLagDays != null && link.timeLagDays > 0 ? (
                                <span className="text-[10px] text-blue-300/50">{link.timeLagDays} days before this</span>
                              ) : <span />}
                            </div>
                            <button
                              type="button"
                              onClick={() => setLinkedEvent(link.causeEvent)}
                              className="text-sm font-semibold text-white/95 mb-1 text-left hover:text-blue-300 transition-colors group/link flex items-center gap-1.5"
                            >
                              {link.causeEvent.title}
                              <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-60 transition-opacity flex-shrink-0" />
                            </button>
                            {link.evidence && (
                              <p className="text-xs text-blue-200/70 italic mt-1.5">"{link.evidence}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {eventData.causal_links!.effects.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/60 mb-2">
                        <ArrowRight className="w-3 h-3" /> Led to
                      </div>
                      <div className="space-y-2">
                        {eventData.causal_links!.effects.map((link, idx) => (
                          <div key={idx} className="border border-emerald-500/25 bg-emerald-500/8 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              {link.timeLagDays != null && link.timeLagDays > 0 ? (
                                <span className="text-[10px] text-emerald-300/50">{link.timeLagDays} days after</span>
                              ) : <span />}
                            </div>
                            <button
                              type="button"
                              onClick={() => setLinkedEvent(link.effectEvent)}
                              className="text-sm font-semibold text-white/95 mb-1 text-left hover:text-emerald-300 transition-colors group/link flex items-center gap-1.5"
                            >
                              {link.effectEvent.title}
                              <ArrowRight className="w-3 h-3 opacity-0 group-hover/link:opacity-60 transition-opacity flex-shrink-0" />
                            </button>
                            {link.evidence && (
                              <p className="text-xs text-emerald-200/70 italic mt-1.5">"{link.evidence}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              ) : null}

              {/* Character linkage */}
              {eventData.impact?.connectionCharacter && (
                <section>
                  <h3 className="text-xs font-bold text-orange-400/80 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Character
                  </h3>
                  <div className="flex items-center gap-2 bg-orange-500/8 border border-orange-500/20 rounded-xl px-4 py-3">
                    <div className="w-7 h-7 rounded-full bg-orange-500/25 flex items-center justify-center flex-shrink-0">
                      <Users className="w-3.5 h-3.5 text-orange-300" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-orange-200">{eventData.impact.connectionCharacter}</p>
                      {eventData.impact.connectionType && (
                        <p className="text-xs text-orange-300/50">{eventData.impact.connectionType}</p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Linked decisions */}
              {eventData.linked_decisions && eventData.linked_decisions.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-amber-400/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Decisions Influenced
                  </h3>
                  <div className="space-y-2">
                    {eventData.linked_decisions.map(d => (
                      <div key={d.id} className="border border-amber-500/25 bg-amber-500/8 rounded-xl p-4">
                        <p className="text-sm font-semibold text-amber-200 mb-1">{d.title}</p>
                        <p className="text-xs text-amber-100/80 leading-relaxed">{d.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Linked insights */}
              {eventData.linked_insights && eventData.linked_insights.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-purple-400/80 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Lightbulb className="w-3.5 h-3.5" /> Insights
                  </h3>
                  <div className="space-y-2">
                    {eventData.linked_insights.map(i => (
                      <div key={i.id} className="border border-purple-500/25 bg-purple-500/8 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline"
                            className="text-[10px] bg-purple-500/20 text-purple-300 border-purple-500/35">
                            {i.category}
                          </Badge>
                          <span className="text-[10px] text-purple-300/65">
                            {formatEpistemicPercent(i.confidence)}
                          </span>
                        </div>
                        <p className="text-sm text-purple-100/95 leading-relaxed">{i.text}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {!eventData.causal_links?.causes?.length && !eventData.causal_links?.effects?.length &&
               !eventData.impact?.connectionCharacter && !eventData.linked_decisions?.length && !eventData.linked_insights?.length && (
                <div className="py-10 text-center">
                  <Link2 className="w-8 h-8 mx-auto mb-3 text-white/10" />
                  <p className="text-sm text-white/55">No connections detected yet.</p>
                  <p className="text-xs text-white/40 mt-1">Connections to people, decisions, and events will appear as they're found.</p>
                </div>
              )}
            </TabsContent>

            {/* ══ EVIDENCE ══ */}
            <TabsContent value="evidence" className="mt-0 p-5 sm:p-6 space-y-6">

              <NarrativeProvenancePanel
                sourceTable="resolved_events"
                sourceId={eventData.id}
                title="What evidence supports this event?"
              />

              {/* Confidence */}
              {eventData.confidence_history && eventData.confidence_history.length > 0 ? (
                <section>
                  <h3 className="text-xs font-bold text-white/75 uppercase tracking-widest mb-3">
                    {epistemicHistoryTitle()}
                  </h3>
                  <EventConfidenceHistory snapshots={eventData.confidence_history} currentConfidence={eventData.confidence} />
                </section>
              ) : (
                <section className="flex items-center justify-between bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-sm">
                  <span className="text-white/50">Current certainty</span>
                  <Badge variant="outline" className={epistemicBadgeColorClass(eventData.confidence)}>
                    {epistemicLabel(eventData.confidence)} · {formatEpistemicPercent(eventData.confidence)}
                  </Badge>
                </section>
              )}

              {/* Source messages */}
              {eventData.source_messages && eventData.source_messages.length > 0 ? (
                <section>
                  <h3 className="text-xs font-bold text-white/75 uppercase tracking-widest mb-3">
                    Source Conversations
                  </h3>
                  <div className="space-y-2">
                    {eventData.source_messages.map(msg => (
                      <Card key={msg.id} className="border-white/8 bg-white/4">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <Badge variant="outline"
                              className={`text-[10px] ${
                                msg.role === 'user'
                                  ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                  : 'bg-white/10 text-white/60 border-white/15'
                              }`}>
                              {msg.role === 'user' ? 'You' : 'Lorekeeper'}
                            </Badge>
                            <span className="text-[10px] text-white/25">{formatDate(msg.created_at)}</span>
                          </div>
                          <p className="text-xs text-white/85 whitespace-pre-wrap leading-relaxed">
                            {msg.original_text || msg.content}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="text-center py-8 text-white/25">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-white/10" />
                  <p className="text-sm">No source messages available.</p>
                </div>
              )}

              {(eventData.source_count && eventData.source_count > 0) ? (
                <p className="text-xs text-white/25 text-right">
                  Based on {eventData.source_count} conversation{eventData.source_count === 1 ? '' : 's'}
                </p>
              ) : null}
            </TabsContent>

          </div>
        </Tabs>
      </div>

      {/* ── Stacked linked-event modal ── */}
      {linkedEvent && (
        <EventDetailModal
          event={makeEventStub(linkedEvent)}
          onClose={() => setLinkedEvent(null)}
          breadcrumb={displayTitle}
        />
      )}
    </div>
  );
};
