import {
  BellRing,
  Check,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMockData } from '../../contexts/MockDataContext';
import {
  CHATGPT_IMPORT_DEMO_COMPLETED_KEY,
  CHATGPT_IMPORT_DEMO_DISMISSED_KEY,
  CHATGPT_IMPORT_DEMO_OPEN_EVENT,
  CHATGPT_IMPORT_DEMO_RETURN_EVENT,
} from '../../lib/chatGPTImportDemo';

type SimulationStep = 'request' | 'waiting' | 'upload' | 'review' | 'complete';

const STEP_ORDER: SimulationStep[] = ['request', 'waiting', 'upload', 'review', 'complete'];

function writeFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
  } catch {
    // The simulation still works for this session when storage is unavailable.
  }
}

export function ChatGPTImportDemoSimulator() {
  const { runtimeDataMode } = useMockData();
  const isDemo =
    runtimeDataMode === 'DEMO' ||
    (typeof window !== 'undefined' && sessionStorage.getItem('lk_demo_runtime') === 'true');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SimulationStep>('request');
  const [returnToOnboarding, setReturnToOnboarding] = useState(false);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ returnToOnboarding?: boolean }>).detail;
      setStep('request');
      setReturnToOnboarding(Boolean(detail?.returnToOnboarding));
      setOpen(true);
    };
    window.addEventListener(CHATGPT_IMPORT_DEMO_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(CHATGPT_IMPORT_DEMO_OPEN_EVENT, handleOpen);
  }, []);

  if (!isDemo) return null;

  const currentIndex = STEP_ORDER.indexOf(step);
  const advance = () => {
    const next = STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)];
    setStep(next);
    if (next === 'complete') {
      writeFlag(CHATGPT_IMPORT_DEMO_COMPLETED_KEY, true);
    }
  };
  const dismiss = () => {
    setOpen(false);
    writeFlag(CHATGPT_IMPORT_DEMO_DISMISSED_KEY, true);
  };
  const continueOnboarding = () => {
    setOpen(false);
    setReturnToOnboarding(false);
    window.dispatchEvent(new CustomEvent(CHATGPT_IMPORT_DEMO_RETURN_EVENT));
  };
  const replay = () => {
    setStep('request');
    setOpen(true);
    writeFlag(CHATGPT_IMPORT_DEMO_DISMISSED_KEY, false);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chatgpt-import-demo-title"
        >
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/12 bg-zinc-950 shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-zinc-950/95 p-5 backdrop-blur">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-200">
                  <Sparkles className="h-3 w-3" />
                  Synthetic demo
                </div>
                <h2 id="chatgpt-import-demo-title" className="text-xl font-semibold text-white">
                  Import My ChatGPT Lore
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  Nothing in this simulation is uploaded or added to your account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-white/40 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close ChatGPT import simulation"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="p-5 sm:p-6">
              <div className="mb-6 flex gap-1.5" aria-label={`Simulation step ${currentIndex + 1} of ${STEP_ORDER.length}`}>
                {STEP_ORDER.map((item, index) => (
                  <span
                    key={item}
                    className={`h-1.5 flex-1 rounded-full ${
                      index <= currentIndex ? 'bg-cyan-400' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>

              {step === 'request' && (
                <div className="space-y-5 text-center">
                  <div className="mx-auto w-fit rounded-2xl bg-primary/15 p-4 text-primary">
                    <BellRing className="h-8 w-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">The export may take several days</h3>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/50">
                      A real user requests their archive from ChatGPT, then continues using LoreBook while it is prepared.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={advance}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
                  >
                    Simulate requesting my export
                  </button>
                </div>
              )}

              {step === 'waiting' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.07] p-5">
                    <div className="flex items-start gap-3">
                      <BellRing className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-semibold text-white">Reminder saved</h3>
                        <p className="mt-1 text-sm text-white/50">
                          LoreBook waits three days, then shows a compact reminder that can be snoozed or dismissed.
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={advance}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Pretend the export arrived
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {step === 'upload' && (
                <div className="space-y-5">
                  <div className="rounded-xl border border-dashed border-cyan-400/30 bg-cyan-400/[0.04] p-7 text-center">
                    <Upload className="mx-auto h-8 w-8 text-cyan-300" />
                    <h3 className="mt-3 font-semibold text-white">Synthetic export analyzed</h3>
                    <p className="mt-1 text-sm text-white/45">
                      12 conversations · 48 user messages · 51 assistant messages excluded
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                    <p className="text-sm leading-relaxed text-white/55">
                      Only synthetic user-authored statements are considered. Assistant claims and likely hypotheticals stay out.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={advance}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Build review proposals
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              )}

              {step === 'review' && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-white">Review before adding to LoreBook</h3>
                    <p className="mt-1 text-sm text-white/45">
                      These sample beliefs are proposals—not canon.
                    </p>
                  </div>
                  {[
                    ['Projects', 'I built MemoVault as my main project.'],
                    ['Preferences & habits', 'I prefer quiet mornings and coffee.'],
                  ].map(([category, belief]) => (
                    <div key={belief} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-200">
                          Your ChatGPT message
                        </span>
                        <span className="text-[10px] text-white/35">{category}</span>
                      </div>
                      <p className="mt-3 text-sm font-medium text-white">{belief}</p>
                      <div className="mt-3 flex gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">
                          <Check className="h-3 w-3" /> Approve
                        </span>
                        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-xs text-white/45">Not accurate</span>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={advance}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white"
                  >
                    Finish simulation
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {step === 'complete' && (
                <div className="space-y-5 text-center">
                  <div className="mx-auto w-fit rounded-full bg-emerald-400/10 p-4 text-emerald-300">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Simulation complete</h3>
                    <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/50">
                      You saw the full delayed-export journey. No files were uploaded and no memories were changed.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={replay}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-4 py-2.5 text-sm text-white/65 hover:bg-white/[0.05]"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Replay
                    </button>
                    {returnToOnboarding ? (
                      <button
                        type="button"
                        onClick={continueOnboarding}
                        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
                      >
                        Continue onboarding
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={dismiss}
                        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
                      >
                        Done — dismiss this demo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
