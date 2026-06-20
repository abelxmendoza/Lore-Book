import { useEffect, useMemo, useRef, useState } from 'react';
import './TimelineGeneratingSimulation.css';

const STAGES = [
  { at: 0, label: 'Scanning memories across your archive…' },
  { at: 18, label: 'Detecting events and turning points…' },
  { at: 38, label: 'Weaving parallel life tracks…' },
  { at: 58, label: 'Connecting people, places, and themes…' },
  { at: 78, label: 'Rendering your timeline…' },
  { at: 94, label: 'Almost there — lore is crystallizing…' },
] as const;

const ERA_TICKS = [
  { at: 12, label: 'Past' },
  { at: 35, label: 'Shift' },
  { at: 58, label: 'Arc' },
  { at: 82, label: 'Now' },
] as const;

const PULSE_AT = [22, 45, 68, 88];

const GHOST_SPARKS = [
  { left: -24, top: 28, delay: '0s' },
  { left: 56, top: 14, delay: '0.24s' },
  { left: -18, top: -6, delay: '0.48s' },
  { left: 72, top: 48, delay: '0.72s' },
  { left: 18, top: -18, delay: '0.96s' },
] as const;

export type TimelineGeneratingSimulationProps = {
  query: string;
  /** Total simulated generation time */
  durationMs?: number;
  onComplete: () => void;
  className?: string;
};

function ghostStage(progress: number): 0 | 1 | 2 | 3 {
  if (progress < 25) return 0;
  if (progress < 50) return 1;
  if (progress < 75) return 2;
  return 3;
}

export function TimelineGeneratingSimulation({
  query,
  durationMs = 5200,
  onComplete,
  className,
}: TimelineGeneratingSimulationProps) {
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState(STAGES[0].label);
  const [stageFade, setStageFade] = useState(true);
  const [visibleTicks, setVisibleTicks] = useState<number[]>([]);
  const [pulses, setPulses] = useState<number[]>([]);
  const completedRef = useRef(false);
  const seenTicksRef = useRef<Set<number>>(new Set());
  const seenPulsesRef = useRef<Set<number>>(new Set());

  const stage = ghostStage(progress);

  const activeStage = useMemo(() => {
    let label = STAGES[0].label;
    for (const s of STAGES) {
      if (progress >= s.at) label = s.label;
    }
    return label;
  }, [progress]);

  useEffect(() => {
    if (activeStage === stageLabel) return;
    setStageFade(false);
    const t = window.setTimeout(() => {
      setStageLabel(activeStage);
      setStageFade(true);
    }, 180);
    return () => window.clearTimeout(t);
  }, [activeStage, stageLabel]);

  useEffect(() => {
    completedRef.current = false;
    seenTicksRef.current = new Set();
    seenPulsesRef.current = new Set();
    setProgress(0);
    setVisibleTicks([]);
    setPulses([]);

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);

      for (const era of ERA_TICKS) {
        if (pct >= era.at && !seenTicksRef.current.has(era.at)) {
          seenTicksRef.current.add(era.at);
          setVisibleTicks((prev) => [...prev, era.at]);
        }
      }

      for (const p of PULSE_AT) {
        if (pct >= p && pct < p + 2 && !seenPulsesRef.current.has(p)) {
          seenPulsesRef.current.add(p);
          setPulses((prev) => [...prev, p]);
        }
      }

      if (elapsed >= durationMs) {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, onComplete, query]);

  return (
    <div
      className={['timeline-gen-screen', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="timeline-generating-simulation"
    >
      <h2 className="timeline-gen-title">Generating timeline</h2>
      {query.trim() && (
        <p className="timeline-gen-query">&ldquo;{query.trim()}&rdquo;</p>
      )}

      <p className={`timeline-gen-stage ${stageFade ? '' : 'timeline-gen-stage--fade'}`}>
        {stageLabel}
      </p>

      <div className="timeline-gen-rail-wrap">
        <div className="timeline-gen-rail" aria-hidden="true">
          <div className="timeline-gen-rail-fill" style={{ width: `${progress}%` }} />
          <div className="timeline-gen-rail-glow" style={{ left: `${progress}%` }} />
          {ERA_TICKS.filter((t) => visibleTicks.includes(t.at)).map((t) => (
            <div key={t.at} className="timeline-gen-tick" style={{ left: `${t.at}%` }}>
              <span className="timeline-gen-tick-label">{t.label}</span>
            </div>
          ))}
          {pulses.map((p) => (
            <span key={p} className="timeline-gen-pulse" style={{ left: `${p}%` }} />
          ))}
        </div>

        <div className="timeline-gen-ghost-lane" aria-hidden="true">
          <div
            className={`timeline-gen-ghost-anchor timeline-gen-ghost-anchor--stage-${stage}`}
            style={{ left: `${Math.max(4, Math.min(96, progress))}%` }}
          >
            <div
              className="timeline-gen-ghost-trail"
              style={{ width: `${Math.min(progress * 1.8, 170)}px`, opacity: progress > 8 ? 1 : 0 }}
            />
            <div className="timeline-gen-ghost-mini">
              <span className="timeline-gen-ghost-aura timeline-gen-ghost-aura--outer" />
              <span className="timeline-gen-ghost-aura timeline-gen-ghost-aura--inner" />
              <span className="timeline-gen-ghost-crown" />
              {GHOST_SPARKS.map((spark, index) => (
                <span
                  key={index}
                  className="timeline-gen-ghost-spark"
                  style={{
                    left: spark.left,
                    top: spark.top,
                    animationDelay: spark.delay,
                  }}
                />
              ))}
              <div className="timeline-gen-ghost-mini-body">
                <span className="timeline-gen-ghost-core" />
                <span className="timeline-gen-ghost-rune timeline-gen-ghost-rune--one" />
                <span className="timeline-gen-ghost-rune timeline-gen-ghost-rune--two" />
                <span className="timeline-gen-ghost-mini-eye timeline-gen-ghost-mini-eye--l" />
                <span className="timeline-gen-ghost-mini-eye timeline-gen-ghost-mini-eye--r" />
                <span className="timeline-gen-ghost-mini-mouth" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="timeline-gen-percent">{Math.round(progress)}%</p>
    </div>
  );
}
