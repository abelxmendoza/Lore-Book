// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, MessageSquare, CalendarDays, Search, Users, MapPin,
  BookMarked, Sparkles, Heart, Shield, Lock,
  ArrowLeft, ChevronDown, ChevronRight, Brain, Info, Zap, Eye,
} from 'lucide-react';

// ─── Accordion section ────────────────────────────────────────────────────────

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  content: React.ReactNode;
}

const AccordionSection = ({
  section,
  isOpen,
  onToggle,
}: {
  section: Section;
  isOpen: boolean;
  onToggle: () => void;
}) => (
  <div className="rounded-xl border border-border/60 bg-black/40 overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-primary">{section.icon}</span>
        <span className="text-white font-semibold">{section.title}</span>
        {section.badge && (
          <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
            {section.badge}
          </span>
        )}
      </div>
      {isOpen
        ? <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0" />
        : <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />
      }
    </button>
    {isOpen && (
      <div className="px-5 pb-6 border-t border-border/60 bg-black/20 space-y-4 pt-5">
        {section.content}
      </div>
    )}
  </div>
);

// ─── Small helpers ────────────────────────────────────────────────────────────

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-3 bg-primary/10 border border-primary/20 rounded-lg p-4">
    <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
    <p className="text-sm text-white/80 leading-relaxed">{children}</p>
  </div>
);

const Example = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-white/10 bg-black/40 p-4">
    {label && <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-2">{label}</p>}
    <p className="text-sm text-white/70 leading-relaxed italic">"{children}"</p>
  </div>
);

const Kv = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3 text-sm">
    <span className="text-white/40 w-28 flex-shrink-0">{k}</span>
    <span className="text-white/70">{v}</span>
  </div>
);

// ─── Journey phase card ───────────────────────────────────────────────────────

const Phase = ({
  n, label, title, body, items,
}: {
  n: string; label: string; title: string; body: string; items: string[];
}) => (
  <div className="rounded-xl border border-border/60 bg-black/40 p-6 space-y-4">
    <div className="flex items-center gap-3">
      <span className="text-3xl font-bold text-primary">{n}</span>
      <span className="text-xs font-semibold uppercase tracking-widest text-white/30">{label}</span>
    </div>
    <h3 className="text-white font-bold text-lg leading-snug">{title}</h3>
    <p className="text-white/60 text-sm leading-relaxed">{body}</p>
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item} className="flex items-start gap-2 text-sm text-white/60">
          <span className="text-primary mt-1">→</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const UserGuide: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState<Set<string>>(new Set(['chat']));

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sections: Section[] = [
    {
      id: 'chat',
      icon: <MessageSquare className="w-5 h-5" />,
      title: 'Chat — where everything starts',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            Chat is the primary interface. Everything else in the app — your timeline, your characters,
            your relationship records, your knowledge claims — gets populated from what you say here.
            Write naturally. Don't try to organize anything. The system does that.
          </p>
          <Example label="How it sounds in practice">
            I went on a date with Jordan last night. It went really well actually — we laughed a lot and they
            stayed later than they said they would. Still not sure what they are looking for though.
          </Example>
          <p className="text-white/50 text-xs">
            From this: a romantic interaction is logged, Jordan's relationship status is updated, sentiment is
            captured as positive, and a pattern check runs to see if this matches prior dynamics.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">The AI adapts to what you need</h4>
              <ul className="space-y-2 text-xs text-white/60">
                {[
                  ['Relationship Advisor', 'When you talk about love, dating, or people'],
                  ['Life Historian', 'When you reflect or look back'],
                  ['Strategist', 'When you are planning or deciding'],
                  ['Processing Partner', 'When you need to work something through'],
                  ['Gossip Buddy', 'When you want to talk about someone'],
                ].map(([name, ctx]) => (
                  <li key={name} className="flex gap-2">
                    <span className="text-primary font-medium w-36 flex-shrink-0">{name}</span>
                    <span>{ctx}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Slash commands</h4>
              <ul className="space-y-2 text-xs font-mono text-white/60">
                {[
                  ['/recent', 'Your latest entries'],
                  ['/characters', 'Everyone in your life'],
                  ['/search <query>', 'Find anything'],
                  ['/arcs', 'Your life arcs'],
                  ['/help', 'Full command list'],
                ].map(([cmd, desc]) => (
                  <li key={cmd} className="flex gap-3">
                    <span className="text-primary">{cmd}</span>
                    <span>{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Note>
            Threads are persistent conversations. Start a new thread when you're shifting to a
            different topic or life area. The AI will always know where you left off.
          </Note>
        </div>
      ),
    },
    {
      id: 'timeline',
      icon: <CalendarDays className="w-5 h-5" />,
      title: 'Timeline & Life Arcs',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            Your timeline builds automatically from everything you share. Entries cluster into eras,
            arcs, and chapters — named life periods that reflect the structure of your actual history.
          </p>

          <div className="rounded-lg border border-border/60 bg-black/30 p-4 space-y-2">
            <h4 className="text-white font-semibold text-sm mb-3">The 9 layers</h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                ['Mythos', 'Your complete life narrative', 'text-purple-400'],
                ['Epoch', 'Broad historical phases', 'text-indigo-400'],
                ['Era', 'Defined time periods', 'text-blue-400'],
                ['Saga', 'Major story arcs', 'text-cyan-400'],
                ['Arc', 'Character and life arcs', 'text-teal-400'],
                ['Chapter', 'Discrete chapters', 'text-green-400'],
                ['Scene', 'Specific events', 'text-yellow-400'],
                ['Action', 'Individual actions', 'text-orange-400'],
                ['MicroAction', 'Smallest moments', 'text-red-400'],
              ].map(([name, desc, color]) => (
                <div key={name}>
                  <p className={`font-semibold ${color} mb-0.5`}>{name}</p>
                  <p className="text-white/40">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-white font-semibold text-sm">Life Arcs</h4>
            <p className="text-white/60 text-sm">
              Life arcs are named periods the system infers from your behavioral patterns — not just time ranges.
              "The NYC Years." "Learning to Code." "The Startup Period." They open and close, and they connect
              causally: the breakup arc can spawn a recovery arc. The college arc can precede the career arc.
            </p>
            <Example label="How arcs appear">
              The 'Building Lorekeeper' arc is currently active (Feb 2026 → present). It overlaps with
              two relationship arcs and one inner arc from the same period.
            </Example>
          </div>

          <Note>
            Gaps between your entries are detected and typed automatically: Recovery Period, Transition Period,
            or simply Undocumented Period. Gaps are part of the record, not missing data.
          </Note>
        </div>
      ),
    },
    {
      id: 'love',
      icon: <Heart className="w-5 h-5" />,
      title: 'Love & Relationships',
      badge: 'Most used',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            This is the place to come for relationship introspection and advice. Describe your dates,
            process confusing situations, work through patterns. The system tracks everything automatically
            from your natural conversation — no forms, no tagging.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-pink-500/20 bg-pink-950/10 p-4">
              <h4 className="text-pink-300 font-semibold text-sm mb-3">What gets tracked automatically</h4>
              <ul className="space-y-1.5 text-xs text-white/60">
                {[
                  'Every date, call, text, fight, and support moment',
                  'Drift direction: growing closer or pulling away',
                  'Active cycles: push-pull, hot-cold, on-again-off-again',
                  'Red flags, green flags, pros, cons',
                  'Key milestones: first kiss, first fight, breakup',
                  'Recovery status after a relationship ends',
                ].map(i => <li key={i} className="flex gap-2"><span className="text-pink-400">·</span>{i}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">The advisor knows your history</h4>
              <p className="text-xs text-white/60 leading-relaxed mb-3">
                When you ask about a relationship, the AI has full context: who they are, what's happened,
                the pattern you're in, and what drift looks like right now.
              </p>
              <Example>
                Based on what's been logged: the last three times communication slowed after a strong
                connection, things drifted. That's a pattern worth naming.
              </Example>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-black/30 p-4">
            <h4 className="text-white font-semibold text-sm mb-3">Cross-relationship patterns</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              After enough relationship history, the system detects what keeps showing up across
              everyone you've dated — not to judge, but to show you your own experience clearly.
              Push-pull dynamics appearing in 3 relationships. The same red flag theme across 4.
              High-intensity starts that cool within 90 days. These become knowledge claims, with evidence.
            </p>
          </div>

          <Note>
            Open the Love & Relationships section to see all tracked relationships, rankings, analytics,
            and the Patterns tab inside each relationship's detail view.
          </Note>
        </div>
      ),
    },
    {
      id: 'knowledge',
      icon: <Brain className="w-5 h-5" />,
      title: 'Knowledge & What LoreBook Believes',
      badge: 'New',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            Over time, LoreBook moves from recording what you say to understanding who you are. It earns
            conclusions from behavioral evidence — what you repeatedly do — not from self-description.
            And it can show you exactly why it believes what it believes.
          </p>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/30">Example knowledge claim</p>
            <div className="space-y-1">
              <Kv k="Type" v="behavioral_pattern" />
              <Kv k="Claim" v="You commit to long technical projects under pressure." />
              <Kv k="Confidence" v="84%" />
              <Kv k="Evidence" v="8 recurring scenes across 26 months, 3 life arcs" />
              <Kv k="Status" v="ACTIVE — reinforced 11 days ago" />
            </div>
          </div>

          <div className="space-y-3 text-sm text-white/60">
            <p>Knowledge claims come in several types:</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ['behavioral_pattern', 'What you repeatedly do in observable contexts'],
                ['value', 'What you consistently need or prioritize'],
                ['lesson', 'What specific experience taught you'],
                ['belief', 'How you understand yourself or the world'],
                ['relationship', 'A significant documented relationship'],
              ].map(([type, desc]) => (
                <div key={type} className="rounded border border-border/60 bg-black/30 p-3">
                  <code className="text-primary text-xs">{type}</code>
                  <p className="text-white/50 text-xs mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <Note>
            Claims are never based on AI inference alone. They require behavioral evidence — recurring
            events and patterns — to crystallize. AI-generated summaries do not count as evidence.
          </Note>
        </div>
      ),
    },
    {
      id: 'people-places',
      icon: <Users className="w-5 h-5" />,
      title: 'People & Places',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            Anyone you mention regularly gets a profile. Any place you reference gets tracked. You don't
            need to do anything — just write naturally and the system builds the roster automatically.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-primary" />
                <h4 className="text-white font-semibold text-sm">Characters</h4>
              </div>
              <ul className="space-y-1.5 text-xs text-white/60">
                {['Auto-detected from entries', 'Relationship tracking and history', 'Timeline integration', 'AI-generated insights', 'Click any name to open their profile'].map(i => (
                  <li key={i} className="flex gap-2"><span className="text-primary">·</span>{i}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <h4 className="text-white font-semibold text-sm">Locations</h4>
              </div>
              <ul className="space-y-1.5 text-xs text-white/60">
                {['Place detection from entries', 'Visit history and timeline', 'Location-based memory search', 'Geographic narrative context'].map(i => (
                  <li key={i} className="flex gap-2"><span className="text-primary">·</span>{i}</li>
                ))}
              </ul>
            </div>
          </div>
          <Note>
            Click any person, place, or memory anywhere in the app to open a unified detail view.
            You can chat directly about that entity, see their connections, and review their full history.
          </Note>
        </div>
      ),
    },
    {
      id: 'lorebook',
      icon: <BookMarked className="w-5 h-5" />,
      title: 'LoreBook — Your Biography',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            Your LoreBook is a generated biography built from your entries — not a summary of what you wrote,
            but a narrative constructed from events, milestones, patterns, arcs, and lessons. Read it like a book.
          </p>
          <Example label="What a chapter might look like">
            2022–2024 was shaped significantly by the relationship with Jordan. You were building your first company
            and falling in love at the same time — two arcs that overlapped and shaped each other. The relationship
            left behind more than memory: a clarified sense of what you need from a partner, and what creative
            partnership costs.
          </Example>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Reading experience</h4>
              <ul className="space-y-1.5 text-xs text-white/60">
                {['Kindle-style reader with multiple themes', 'Chapter navigation by life period', 'Adjustable font size and spacing', 'Progress tracking through your story'].map(i => (
                  <li key={i} className="flex gap-2"><span className="text-primary">·</span>{i}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Generation options</h4>
              <ul className="space-y-1.5 text-xs text-white/60">
                {['Full life or specific time range', 'Tone: neutral, reflective, dramatic, mythic', 'Depth: summary, detailed, or epic', 'Export to PDF or Markdown'].map(i => (
                  <li key={i} className="flex gap-2"><span className="text-primary">·</span>{i}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'discovery',
      icon: <Sparkles className="w-5 h-5" />,
      title: 'Discovery Hub',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            The Discovery Hub is where analytical insights live — patterns, identity, relationship analytics,
            soul profile. It processes everything you've shared and surfaces what it found.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ['Identity', 'Core identity elements derived from your history'],
              ['Soul Profile', 'Hopes, fears, strengths, values, and patterns'],
              ['Relationship Analytics', 'Affection scores, compatibility, health trends'],
              ['Insights', 'Pattern detection across all your data'],
              ['Autopilot', 'Strategic guidance based on your arc history'],
              ['Truth Seeker', 'Fact-checking and contradiction detection'],
            ].map(([name, desc]) => (
              <div key={name} className="rounded-lg border border-border/60 bg-black/30 p-3">
                <p className="text-white font-semibold text-xs mb-1">{name}</p>
                <p className="text-white/50 text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'search',
      icon: <Search className="w-5 h-5" />,
      title: 'Memory Search',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            Search your memories by meaning, not just keywords. The system understands context,
            relationships, and time references naturally.
          </p>
          <div className="rounded-lg border border-border/60 bg-black/30 p-4">
            <h4 className="text-white font-semibold text-sm mb-3">What you can search for</h4>
            <ul className="space-y-2 text-xs font-mono text-white/60">
              {[
                'entries about Sarah last month',
                'when did I feel most hopeful',
                'memories at the coffee shop in 2023',
                'fights I had with anyone',
                'when I was working on the startup',
                'everything I said about wanting to leave',
              ].map(q => (
                <li key={q} className="flex gap-2 items-start">
                  <span className="text-primary mt-0.5">"</span>
                  <span>{q}"</span>
                </li>
              ))}
            </ul>
          </div>
          <Note>
            The search understands people, places, dates, emotions, topics, and life periods.
            No special syntax required.
          </Note>
        </div>
      ),
    },
    {
      id: 'privacy',
      icon: <Shield className="w-5 h-5" />,
      title: 'Privacy & Your Data',
      content: (
        <div className="space-y-5">
          <p className="text-white/60 text-sm leading-relaxed">
            You're trusting LoreBook with the most personal thing you have — your actual life. Everything is
            private until you choose otherwise. No human ever sees your entries.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-green-500/20 bg-green-950/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-green-400" />
                <h4 className="text-white font-semibold text-sm">What's encrypted</h4>
              </div>
              <ul className="space-y-1.5 text-xs text-white/60">
                {['Journal entries in transit and at rest', 'Conversations with the AI', 'Character and relationship data', 'All personal metadata'].map(i => (
                  <li key={i} className="flex gap-2"><span className="text-green-400">·</span>{i}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-green-500/20 bg-green-950/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-green-400" />
                <h4 className="text-white font-semibold text-sm">Your control</h4>
              </div>
              <ul className="space-y-1.5 text-xs text-white/60">
                {['Export all data anytime', 'Delete account and all data permanently', 'Biography publishing is opt-in only', 'No advertising, no data selling'].map(i => (
                  <li key={i} className="flex gap-2"><span className="text-green-400">·</span>{i}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-white/40">
            Manage privacy settings in Account Center → Privacy & Security.
          </p>
        </div>
      ),
    },
    {
      id: 'tips',
      icon: <Zap className="w-5 h-5" />,
      title: 'Tips & Quick Reference',
      content: (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Writing tips</h4>
              <ul className="space-y-2 text-xs text-white/60">
                {[
                  ['Write naturally', 'No structure needed. The system extracts the structure.'],
                  ['Include detail', 'The more context (who, where, what happened), the better.'],
                  ['Use real names', 'The system tracks people by name — be consistent.'],
                  ['Journal regularly', 'The picture gets clearer the more you contribute.'],
                  ['Revisit and reflect', 'Looking back on old events generates the richest insights.'],
                ].map(([k, v]) => (
                  <li key={k}>
                    <span className="text-white font-medium">{k}</span>
                    <span className="text-white/40"> — {v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border/60 bg-black/30 p-4">
              <h4 className="text-white font-semibold text-sm mb-3">Keyboard shortcuts</h4>
              <ul className="space-y-2 text-xs text-white/60 font-mono">
                {[
                  ['/help', 'Show all slash commands'],
                  ['Esc', 'Close modals'],
                  ['Enter', 'Send message'],
                  ['Shift + Enter', 'New line in message'],
                ].map(([key, desc]) => (
                  <li key={key} className="flex gap-3 items-center">
                    <kbd className="px-2 py-0.5 bg-black/60 border border-border/60 rounded text-primary">{key}</kbd>
                    <span className="font-sans">{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-black/30 p-4">
            <h4 className="text-white font-semibold text-sm mb-3">The compound effect</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              LoreBook improves meaningfully with time. At one month, it knows your main characters and recent history.
              At six months, patterns emerge and knowledge claims start forming. At a year, the system knows things
              about you that are genuinely hard to articulate yourself — because they come from behavioral evidence
              across hundreds of conversations, not from how you describe yourself.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-950 to-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Back */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8 group text-sm"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/20 rounded-xl">
              <BookOpen className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">LoreBook Guide</h1>
              <p className="text-white/50 mt-1 text-sm">How to get the most out of it</p>
            </div>
          </div>
        </div>

        {/* Journey section */}
        <div className="mb-12">
          <h2 className="text-lg font-bold text-white mb-2">What to expect, and when</h2>
          <p className="text-white/50 text-sm mb-6">
            LoreBook compounds. It gets genuinely smarter the longer you use it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Phase
              n="01"
              label="First session"
              title="Just start talking"
              body="Write anything — your day, something that happened, how you're feeling. Don't try to structure it. The system listens."
              items={[
                'Open Chat and type naturally',
                'Mention people by name',
                'Your first characters and timeline entries appear',
              ]}
            />
            <Phase
              n="02"
              label="First week"
              title="Your world takes shape"
              body="The more you share, the more characters, locations, and timeline entries populate automatically. Your recent history starts becoming visible."
              items={[
                'Explore your Characters section',
                'Check your Timeline — see what organized itself',
                'Open Love & Relationships if relevant',
              ]}
            />
            <Phase
              n="03"
              label="First month"
              title="Patterns emerge"
              body="Behavioral patterns become recognizable. The AI starts offering more specific, contextualized responses. First knowledge claims may form."
              items={[
                'Check Discovery Hub for early insights',
                'Notice when the AI references your history unprompted',
                'Generate your first biography section',
              ]}
            />
            <Phase
              n="04"
              label="Long term"
              title="The system knows things"
              body="After sustained use, LoreBook holds a genuine model of who you are — behavioral patterns, life arcs, cross-relationship dynamics. It knows things about you that are hard to articulate yourself."
              items={[
                'Knowledge claims show up with full evidence traces',
                'Life arcs open and close as your life does',
                'Your biography reads like a real chapter of a real life',
              ]}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40 mb-8" />
        <h2 className="text-lg font-bold text-white mb-4">Feature Reference</h2>

        {/* Accordion */}
        <div className="space-y-2">
          {sections.map(section => (
            <AccordionSection
              key={section.id}
              section={section}
              isOpen={open.has(section.id)}
              onToggle={() => toggle(section.id)}
            />
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 rounded-xl border border-primary/20 bg-primary/10 p-5">
          <div className="flex items-start gap-3">
            <Eye className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-white font-semibold text-sm mb-1">One thing to remember</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                LoreBook never asks you to trust a black box. Every conclusion it draws — every knowledge claim,
                every pattern it names — comes with traceable evidence. You can always ask "why do you believe that?"
                and get a real answer with real receipts.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default UserGuide;
