import {
  BookOpen,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileText,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useMockData } from '../../contexts/MockDataContext';
import {
  CHATGPT_IMPORT_DEMO_RETURN_EVENT,
  openChatGPTImportDemo,
} from '../../lib/chatGPTImportDemo';
import {
  ONBOARDING_DEMO_COMPLETED_KEY,
  ONBOARDING_DEMO_DISMISSED_KEY,
  ONBOARDING_DEMO_OPEN_EVENT,
} from '../../lib/onboardingDemo';

type Stage = 'welcome' | 'source' | 'ai' | 'materials' | 'fresh' | 'profile' | 'complete';
type Branch = 'chatgpt' | 'other-ai' | 'materials' | 'fresh' | null;

const MATERIAL_OPTIONS = [
  { id: 'journals', label: 'Journals and diaries', icon: BookOpen },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'documents', label: 'Documents and notes', icon: FileText },
];

const FRESH_OPTIONS = [
  'Remember the people who matter',
  'Track projects and goals',
  'Understand patterns in my life',
];

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
  } catch {
    // Demo completion remains session-only when storage is unavailable.
  }
}

export function OnboardingDemoSimulator() {
  const { runtimeDataMode } = useMockData();
  const isDemo =
    runtimeDataMode === 'DEMO' ||
    (typeof window !== 'undefined' && sessionStorage.getItem('lk_demo_runtime') === 'true');
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('welcome');
  const [branch, setBranch] = useState<Branch>(null);
  const [selectedAi, setSelectedAi] = useState<'Claude' | 'Grok' | 'Another assistant' | null>(null);
  const [materials, setMaterials] = useState<Set<string>>(new Set());
  const [freshGoals, setFreshGoals] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(() => readFlag(ONBOARDING_DEMO_COMPLETED_KEY));
  const [dismissed, setDismissed] = useState(() => readFlag(ONBOARDING_DEMO_DISMISSED_KEY));

  const restart = () => {
    setStage('welcome');
    setBranch(null);
    setSelectedAi(null);
    setMaterials(new Set());
    setFreshGoals(new Set());
    setDismissed(false);
    writeFlag(ONBOARDING_DEMO_DISMISSED_KEY, false);
    setOpen(true);
  };

  useEffect(() => {
    const handleOpen = () => restart();
    const handleChatGPTReturn = () => {
      setBranch('chatgpt');
      setStage('profile');
      setOpen(true);
    };
    window.addEventListener(ONBOARDING_DEMO_OPEN_EVENT, handleOpen);
    window.addEventListener(CHATGPT_IMPORT_DEMO_RETURN_EVENT, handleChatGPTReturn);
    return () => {
      window.removeEventListener(ONBOARDING_DEMO_OPEN_EVENT, handleOpen);
      window.removeEventListener(CHATGPT_IMPORT_DEMO_RETURN_EVENT, handleChatGPTReturn);
    };
  }, []);

  const profile = useMemo(() => {
    if (branch === 'chatgpt') {
      return {
        source: 'ChatGPT history',
        summary: 'Years of conversations accelerated the starting profile.',
        facts: ['Marcus is building MemoVault.', 'Jamie is an important collaborator.', 'Quiet mornings help Marcus focus.'],
        counts: ['12 conversations scanned', '2 beliefs awaiting review', '1 assistant claim excluded'],
      };
    }
    if (branch === 'other-ai') {
      return {
        source: selectedAi ?? 'Another AI assistant',
        summary: 'Portable conversation history can seed LoreBook without defining it.',
        facts: ['Marcus is building MemoVault.', 'Jamie is an important collaborator.', 'Native import can be completed later.'],
        counts: ['Conversation text accepted', 'Provenance retained', 'Review required'],
      };
    }
    if (branch === 'materials') {
      return {
        source: 'Personal archives',
        summary: 'Existing material becomes a reviewable starting record.',
        facts: ['A journal chapter was detected.', 'Jamie appears in several moments.', 'A project called MemoVault was found.'],
        counts: [`${materials.size || 1} source types selected`, '24 moments proposed', '8 photos organized'],
      };
    }
    return {
      source: 'Guided Life Snapshot',
      summary: 'A useful LoreBook can begin with one short conversation.',
      facts: ['Jamie is someone important.', 'MemoVault is an active project.', 'Marcus wants to understand recurring patterns.'],
      counts: [`${freshGoals.size || 1} priorities selected`, '3 starter beliefs', '5 next questions'],
    };
  }, [branch, freshGoals.size, materials.size, selectedAi]);

  if (!isDemo) return null;

  const finish = () => {
    setStage('complete');
    setCompleted(true);
    writeFlag(ONBOARDING_DEMO_COMPLETED_KEY, true);
  };
  const dismiss = () => {
    setOpen(false);
    setDismissed(true);
    writeFlag(ONBOARDING_DEMO_DISMISSED_KEY, true);
  };
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const goBack = () => {
    if (stage === 'source') setStage('welcome');
    else if (['ai', 'materials', 'fresh'].includes(stage)) setStage('source');
    else if (stage === 'profile') setStage(branch === 'materials' ? 'materials' : branch === 'fresh' ? 'fresh' : 'ai');
  };

  return (
    <>
      {!open && !dismissed && (
        <aside className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-[64] rounded-xl border border-violet-400/25 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-[380px]">
          <button type="button" onClick={restart} className="flex w-full items-start gap-3 text-left">
            <div className="rounded-lg bg-violet-400/10 p-2 text-violet-300">
              {completed ? <CheckCircle2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {completed ? 'Onboarding simulation completed' : 'See how LoreBook learns your story'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                {completed
                  ? 'Replay any starting path or dismiss this launcher.'
                  : 'Try onboarding with AI history, personal archives, or no existing data.'}
              </p>
            </div>
            <ChevronRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-white/35" />
          </button>
          {completed && (
            <button type="button" onClick={dismiss} className="mt-3 text-xs text-white/35 hover:text-white/65">
              Dismiss — I’ve finished this simulation
            </button>
          )}
        </aside>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-demo-title"
        >
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/12 bg-zinc-950 shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-950/95 p-5 backdrop-blur">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200">
                  <Sparkles className="h-3 w-3" /> Synthetic onboarding
                </div>
                <h2 id="onboarding-demo-title" className="text-xl font-semibold text-white">
                  {stage === 'welcome' ? 'Begin Your LoreBook' : 'Where does your story live today?'}
                </h2>
                <p className="mt-1 text-sm text-white/45">No real information is collected in this simulation.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close onboarding simulation"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="p-5 sm:p-7">
              {stage === 'welcome' && (
                <div className="space-y-6 text-center">
                  <div className="mx-auto w-fit rounded-2xl bg-violet-400/10 p-5 text-violet-300">
                    <BookOpen className="h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-semibold text-white">Your story can start anywhere</h3>
                    <p className="mx-auto mt-3 max-w-xl leading-relaxed text-white/55">
                      Bring years of conversations, journals and photos, or nothing at all. LoreBook should deliver a useful first result on every path.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStage('source')}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white"
                  >
                    Try the onboarding paths <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {stage === 'source' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      title: 'AI conversation history',
                      description: 'ChatGPT, Claude, Grok, or another assistant.',
                      icon: Bot,
                      next: 'ai' as Stage,
                    },
                    {
                      title: 'Journals, photos, or documents',
                      description: 'Bring personal material you already have.',
                      icon: FileArchive,
                      next: 'materials' as Stage,
                    },
                    {
                      title: 'I’m starting fresh',
                      description: 'Build a Life Snapshot through conversation.',
                      icon: MessageCircle,
                      next: 'fresh' as Stage,
                    },
                  ].map((option) => (
                    <button
                      key={option.title}
                      type="button"
                      onClick={() => setStage(option.next)}
                      className="rounded-xl border border-white/10 bg-white/[0.025] p-5 text-left transition hover:border-primary/40 hover:bg-primary/[0.06]"
                    >
                      <option.icon className="h-7 w-7 text-primary" />
                      <h3 className="mt-4 font-semibold text-white">{option.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/45">{option.description}</p>
                    </button>
                  ))}
                </div>
              )}

              {stage === 'ai' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Which assistant holds your history?</h3>
                    <p className="mt-1 text-sm text-white/45">
                      ChatGPT has a full simulated export flow. Other assistants demonstrate the portable-history path without claiming unsupported native imports.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBranch('chatgpt');
                        setOpen(false);
                        openChatGPTImportDemo({ returnToOnboarding: true });
                      }}
                      className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.05] p-5 text-left hover:bg-cyan-400/[0.08]"
                    >
                      <Upload className="h-6 w-6 text-cyan-300" />
                      <h4 className="mt-3 font-semibold text-white">ChatGPT export</h4>
                      <p className="mt-1 text-sm text-white/45">Simulate request, waiting, upload, and Memory Review.</p>
                    </button>
                    {(['Claude', 'Grok', 'Another assistant'] as const).map((assistant) => (
                      <button
                        key={assistant}
                        type="button"
                        onClick={() => {
                          setSelectedAi(assistant);
                          setBranch('other-ai');
                        }}
                        className={`rounded-xl border p-5 text-left ${
                          selectedAi === assistant
                            ? 'border-primary bg-primary/10'
                            : 'border-white/10 bg-white/[0.025] hover:border-primary/35'
                        }`}
                      >
                        <Bot className="h-6 w-6 text-white/55" />
                        <h4 className="mt-3 font-semibold text-white">{assistant}</h4>
                        <p className="mt-1 text-sm text-white/40">Conversation text now; native export support later.</p>
                      </button>
                    ))}
                  </div>
                  {selectedAi && (
                    <button
                      type="button"
                      onClick={() => setStage('profile')}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
                    >
                      Continue with {selectedAi} <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {stage === 'materials' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Choose synthetic source material</h3>
                    <p className="mt-1 text-sm text-white/45">Select one or more. Nothing leaves the demo.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {MATERIAL_OPTIONS.map((option) => {
                      const selected = materials.has(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggle(setMaterials, option.id)}
                          className={`rounded-xl border p-5 text-left ${
                            selected ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/[0.025]'
                          }`}
                        >
                          <option.icon className="h-6 w-6 text-primary" />
                          <span className="mt-3 flex items-center justify-between gap-2 text-sm font-medium text-white">
                            {option.label}
                            {selected && <Check className="h-4 w-4 text-emerald-300" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={materials.size === 0}
                    onClick={() => {
                      setBranch('materials');
                      setStage('profile');
                    }}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Build a profile from these sources
                  </button>
                </div>
              )}

              {stage === 'fresh' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-5">
                    <div className="flex items-start gap-3">
                      <MessageCircle className="mt-0.5 h-6 w-6 text-violet-300" />
                      <div>
                        <h3 className="font-semibold text-white">A two-minute Life Snapshot</h3>
                        <p className="mt-1 text-sm text-white/50">
                          A real onboarding would ask about important people, current projects, meaningful places, and what you want help remembering.
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-white/70">What should the synthetic user prioritize?</p>
                  <div className="space-y-2">
                    {FRESH_OPTIONS.map((goal) => {
                      const selected = freshGoals.has(goal);
                      return (
                        <button
                          key={goal}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggle(setFreshGoals, goal)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm ${
                            selected ? 'border-primary bg-primary/10 text-white' : 'border-white/10 text-white/55'
                          }`}
                        >
                          <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-primary bg-primary' : 'border-white/20'}`}>
                            {selected && <Check className="h-3.5 w-3.5 text-white" />}
                          </span>
                          {goal}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={freshGoals.size === 0}
                    onClick={() => {
                      setBranch('fresh');
                      setStage('profile');
                    }}
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Create the Life Snapshot
                  </button>
                </div>
              )}

              {stage === 'profile' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-5">
                    <div className="flex items-start gap-3">
                      <UserRound className="mt-0.5 h-7 w-7 text-emerald-300" />
                      <div>
                        <p className="text-xs uppercase tracking-wider text-emerald-200/60">Your LoreBook is beginning</p>
                        <h3 className="mt-1 text-xl font-semibold text-white">{profile.source}</h3>
                        <p className="mt-1 text-sm text-white/50">{profile.summary}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {profile.counts.map((count) => (
                      <div key={count} className="rounded-lg border border-white/10 bg-white/[0.025] p-3 text-center text-xs text-white/55">
                        {count}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {profile.facts.map((fact, index) => (
                      <div key={fact} className="flex items-start gap-3 rounded-lg border border-white/10 bg-black/25 p-3">
                        {index === 1 ? <Users className="mt-0.5 h-4 w-4 text-primary" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />}
                        <p className="text-sm text-white/70">{fact}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-white/35">
                    In the real product, these are reviewable proposals with provenance—not unquestioned facts.
                  </p>
                  <button
                    type="button"
                    onClick={finish}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Continue into Chat <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {stage === 'complete' && (
                <div className="space-y-6 text-center">
                  <div className="mx-auto w-fit rounded-full bg-emerald-400/10 p-4 text-emerald-300">
                    <CheckCircle2 className="h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">Onboarding simulation complete</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/50">
                      Historical data accelerates LoreBook, but it is never required. Every path reaches a useful, reviewable starting profile.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={restart}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-4 py-2.5 text-sm text-white/65"
                    >
                      <RotateCcw className="h-4 w-4" /> Try another path
                    </button>
                    <button
                      type="button"
                      onClick={dismiss}
                      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
                    >
                      Done — dismiss onboarding demo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!['welcome', 'complete'].includes(stage) && (
              <footer className="border-t border-white/10 px-5 py-3 sm:px-7">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </>
  );
}
