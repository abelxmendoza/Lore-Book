import { useState, useEffect } from 'react';
import { shortDisplayName } from '../../lib/displayName';
import {
  Plus, MessageSquareHeart, CheckCircle2, AlertTriangle,
  Eye, EyeOff, MessageSquare, Link2, ChevronRight,
  Clock, RotateCcw, Loader2,
} from 'lucide-react';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry } from '../../types/perception';
import { PerceptionEntryModal } from './PerceptionEntryModal';
import { GossipChatModal } from './GossipChatModal';
import { shouldUseMockData } from '../../hooks/useShouldUseMockData';
import { InsufficientData } from '../ui/InsufficientData';

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceLabel(level: number): { label: string; color: string; bar: string } {
  if (level >= 0.75) return { label: 'HIGH CONFIDENCE',   color: 'text-emerald-400', bar: 'bg-emerald-500' };
  if (level >= 0.5)  return { label: 'MEDIUM CONFIDENCE', color: 'text-amber-400',   bar: 'bg-amber-500' };
  if (level >= 0.25) return { label: 'LOW CONFIDENCE',    color: 'text-rose-400',   bar: 'bg-rose-500' };
  return                    { label: 'UNCERTAIN',          color: 'text-white/30',    bar: 'bg-white/20' };
}

function sourceLabel(source: string): { label: string; icon: React.ReactNode; border: string } {
  switch (source) {
    case 'told_by':     return { label: 'First-hand',   icon: <MessageSquare className="h-3.5 w-3.5" />, border: 'border-purple-500/40' };
    case 'overheard':   return { label: 'Overheard',    icon: <Eye className="h-3.5 w-3.5" />,           border: 'border-blue-500/30 border-dashed' };
    case 'rumor':       return { label: 'Rumor',        icon: <AlertTriangle className="h-3.5 w-3.5" />, border: 'border-rose-500/30 border-dotted' };
    case 'intuition':   return { label: 'Intuition',    icon: <EyeOff className="h-3.5 w-3.5" />,        border: 'border-pink-500/30' };
    case 'social_media':return { label: 'Social media', icon: <Link2 className="h-3.5 w-3.5" />,         border: 'border-cyan-500/30' };
    default:            return { label: source,         icon: <MessageSquare className="h-3.5 w-3.5" />, border: 'border-white/10' };
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'confirmed':  return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case 'disproven':  return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
    case 'retracted':  return <RotateCcw className="h-3.5 w-3.5 text-white/30" />;
    default:           return <Clock className="h-3.5 w-3.5 text-white/30" />;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30)  return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// ── Mock data factory (character-specific) ────────────────────────────────────

function mockPerceptionsFor(personName: string, personId: string): PerceptionEntry[] {
  const first = shortDisplayName(personName);
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000).toISOString();

  return [
    {
      id: `mock-${personId}-1`,
      user_id: 'mock-user',
      subject_person_id: personId,
      subject_alias: first,
      content: `I believe ${first} was testing my availability to see how much I prioritize our connection.`,
      source: 'intuition',
      source_detail: 'Pattern I noticed over several weeks',
      confidence_level: 0.72,
      sentiment: 'mixed',
      timestamp_heard: days(12),
      related_memory_id: null,
      impact_on_me: 'I became more guarded and started second-guessing every interaction.',
      status: 'unverified',
      retracted: false,
      resolution_note: null,
      original_content: `I thought ${first} genuinely wanted to spend time together.`,
      evolution_notes: [
        `${new Date(now - 30 * 86_400_000).toLocaleDateString()}: Originally thought they were interested`,
        `${new Date(now - 12 * 86_400_000).toLocaleDateString()}: Noticed the pattern of testing`,
      ],
      created_in_high_emotion: false,
      review_reminder_at: null,
      metadata: {},
      created_at: days(30),
      updated_at: days(12),
    },
    {
      id: `mock-${personId}-2`,
      user_id: 'mock-user',
      subject_person_id: personId,
      subject_alias: first,
      content: `I heard that ${first} has been telling mutual friends that things between us are more casual than I thought.`,
      source: 'told_by',
      source_detail: 'Mentioned by a mutual friend in passing',
      confidence_level: 0.45,
      sentiment: 'negative',
      timestamp_heard: days(5),
      related_memory_id: null,
      impact_on_me: 'This made me pull back and reconsider what I thought we had. I stopped initiating plans.',
      status: 'unverified',
      retracted: false,
      resolution_note: null,
      original_content: null,
      evolution_notes: [],
      created_in_high_emotion: true,
      review_reminder_at: new Date(now + 2 * 86_400_000).toISOString(),
      metadata: {},
      created_at: days(5),
      updated_at: days(5),
    },
    {
      id: `mock-${personId}-3`,
      user_id: 'mock-user',
      subject_person_id: personId,
      subject_alias: first,
      content: `I think ${first} avoids long-term commitment because of something in their past, not because of me.`,
      source: 'intuition',
      source_detail: 'Based on multiple conversations and reactions',
      confidence_level: 0.58,
      sentiment: 'neutral',
      timestamp_heard: days(45),
      related_memory_id: null,
      impact_on_me: 'This helped me depersonalize their behavior and stopped me from blaming myself.',
      status: 'confirmed',
      retracted: false,
      resolution_note: 'They confirmed something from their past affected how they approach relationships.',
      original_content: `I assumed ${first} wasn\'t interested in anything serious with anyone.`,
      evolution_notes: [
        `${new Date(now - 60 * 86_400_000).toLocaleDateString()}: Initially assumed total avoidance`,
        `${new Date(now - 45 * 86_400_000).toLocaleDateString()}: Realized it\'s likely past-related, not me`,
        `${new Date(now - 20 * 86_400_000).toLocaleDateString()}: Confirmed via conversation`,
      ],
      created_in_high_emotion: false,
      review_reminder_at: null,
      metadata: {},
      created_at: days(60),
      updated_at: days(20),
    },
  ];
}

// ── Belief card ───────────────────────────────────────────────────────────────

function BeliefCard({
  perception,
  onEdit,
}: {
  perception: PerceptionEntry;
  onEdit: (p: PerceptionEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const conf = confidenceLabel(perception.confidence_level);
  const src = sourceLabel(perception.source);
  const hasEvolution = perception.evolution_notes && perception.evolution_notes.length > 1;

  return (
    <div className={`rounded-xl border ${src.border} bg-black/30 p-4 space-y-3`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {statusIcon(perception.status)}
          <span className={`text-[10px] font-bold tracking-widest uppercase ${conf.color}`}>
            {conf.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-white/30">
          <span className="text-[10px]">{src.icon}</span>
          <span className="text-[10px] capitalize">{src.label}</span>
          <span className="text-[10px]">·</span>
          <span className="text-[10px]">{timeAgo(perception.timestamp_heard)}</span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${conf.bar}`}
            // eslint-disable-next-line react/forbid-dom-props
            style={{ width: `${Math.round(perception.confidence_level * 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-white/30 tabular-nums w-6 text-right">
          {Math.round(perception.confidence_level * 100)}%
        </span>
      </div>

      {/* Content */}
      <p className="text-sm text-white/80 leading-relaxed italic">
        "{perception.content}"
      </p>

      {/* Impact */}
      {perception.impact_on_me && perception.impact_on_me !== 'Not specified' && (
        <p className="text-xs text-white/40 leading-relaxed border-l-2 border-white/10 pl-3">
          {perception.impact_on_me}
        </p>
      )}

      {/* Evolution badge + edit */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          {hasEvolution && (
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition"
            >
              <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              {perception.evolution_notes!.length} revisions
            </button>
          )}
          {perception.created_in_high_emotion && (
            <span className="text-[10px] text-amber-400/70 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> High emotion
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onEdit(perception)}
          className="text-[10px] text-white/30 hover:text-white/60 transition"
        >
          Edit
        </button>
      </div>

      {/* Evolution timeline */}
      {expanded && hasEvolution && (
        <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-purple-500/20">
          {perception.evolution_notes!.map((note, i) => (
            <p key={i} className="text-[11px] text-white/40 leading-relaxed">
              {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  personId: string;
  personName: string;
};

export const CharacterPerceptionsTab = ({ personId, personName }: Props) => {
  const [perceptions, setPerceptions] = useState<PerceptionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);
  const [editing, setEditing] = useState<PerceptionEntry | null>(null);
  const useMock = shouldUseMockData();

  const firstName = shortDisplayName(personName);

  const load = async () => {
    setLoading(true);
    try {
      if (useMock) {
        setPerceptions(mockPerceptionsFor(personName, personId));
      } else {
        const data = await perceptionApi.getPerceptionsAboutPerson(personId);
        setPerceptions(data);
      }
    } catch {
      if (useMock) setPerceptions(mockPerceptionsFor(personName, personId));
      else setPerceptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [personId, useMock]);

  const active = perceptions.filter(p => !p.retracted && p.status !== 'retracted');
  const needsReview = perceptions.filter(
    p => p.review_reminder_at && new Date(p.review_reminder_at) <= new Date() && !p.retracted
  );
  const hasEvolution = active.filter(p => (p.evolution_notes?.length ?? 0) > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Character Intelligence</h3>
          <p className="text-xs text-white/50 mt-0.5">What you believe about {firstName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDebrief(true)}
            className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-500/60 rounded-lg px-3 py-1.5 transition"
          >
            <MessageSquareHeart className="h-3.5 w-3.5" />
            Debrief
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add belief
          </button>
        </div>
      </div>

      {/* Review reminder banner */}
      {needsReview.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-white/70 flex-1">
            <span className="text-amber-400 font-semibold">{needsReview.length} belief{needsReview.length > 1 ? 's' : ''}</span>
            {' '}flagged for review — captured during high emotion
          </p>
          <button type="button" className="text-xs text-amber-400 hover:text-amber-300 transition whitespace-nowrap">
            Review now →
          </button>
        </div>
      )}

      {/* Empty state */}
      {active.length === 0 && (
        <InsufficientData
          icon={Eye}
          accent="purple"
          title="No beliefs recorded yet"
          description={`What do you think, believe, or sense about ${firstName}? Perceptions are how your understanding of them is tracked over time.`}
          action={{
            label: "Tell LoreBook what you've noticed",
            icon: MessageSquareHeart,
            onClick: () => setShowDebrief(true),
          }}
        />
      )}

      {/* Current beliefs */}
      {active.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-widest text-white/60">
            Current beliefs
          </h4>
          <div className="space-y-3">
            {active.map(p => (
              <BeliefCard
                key={p.id}
                perception={p}
                onEdit={setEditing}
              />
            ))}
          </div>
        </section>
      )}

      {/* How this changed — only if any have evolution */}
      {hasEvolution.length > 0 && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-widest text-white/60">
            How this changed
          </h4>
          <div className="space-y-2">
            {hasEvolution.map(p => {
              const notes = p.evolution_notes ?? [];
              const allVersions = p.original_content
                ? [{ date: p.created_at, text: p.original_content }, ...notes.map(n => {
                    const [date, ...rest] = n.split(': ');
                    return { date, text: rest.join(': ') };
                  })]
                : notes.map(n => {
                    const [date, ...rest] = n.split(': ');
                    return { date, text: rest.join(': ') };
                  });

              if (allVersions.length < 2) return null;

              return (
                <div key={p.id} className="rounded-xl border border-white/6 bg-black/20 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-3">
                    {firstName}'s belief arc
                  </p>
                  <div className="space-y-2">
                    {allVersions.map((v, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                          <div className={`h-2 w-2 rounded-full ${i === allVersions.length - 1 ? 'bg-purple-400' : 'bg-white/20'}`} />
                          {i < allVersions.length - 1 && <div className="w-px h-4 bg-white/10" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {typeof v.date === 'string' && v.date.includes('-') && (
                            <p className="text-[10px] text-white/25 mb-0.5">
                              {new Date(v.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                            </p>
                          )}
                          <p className={`text-xs leading-relaxed ${i === allVersions.length - 1 ? 'text-white/80 font-medium' : 'text-white/40'}`}>
                            {v.text && v.text.length > 100 ? v.text.slice(0, 100) + '…' : v.text}
                            {i === allVersions.length - 1 && (
                              <span className="ml-2 text-[10px] text-purple-400 font-semibold">current</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Modals */}
      {(showAdd || editing) && (
        <PerceptionEntryModal
          perception={editing ?? undefined}
          personId={personId}
          personName={personName}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSave={() => { setShowAdd(false); setEditing(null); load(); }}
        />
      )}
      {showDebrief && (
        <GossipChatModal
          onClose={() => setShowDebrief(false)}
          onPerceptionsCreated={() => { setShowDebrief(false); load(); }}
        />
      )}
    </div>
  );
};
