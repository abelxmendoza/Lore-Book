import { useEffect, useMemo, useState } from 'react';
import { Check, Circle, Sparkles } from 'lucide-react';
import './ComposingIndicator.css';

type ComposingIndicatorProps = {
  compact?: boolean;
  contentStarted?: boolean;
  showReasoning?: boolean;
  sourceCount?: number;
  contextItems?: number;
  activePersona?: string;
  intent?: string;
};

const BASE_STEPS = [
  'Reading your message',
  'Checking relevant lore',
  'Connecting story context',
  'Drafting the response',
  'Finalizing wording',
];

const formatIntent = (intent?: string) =>
  intent
    ? intent
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : undefined;

export const ComposingIndicator = ({
  compact = false,
  contentStarted = false,
  showReasoning = true,
  sourceCount,
  contextItems,
  activePersona,
  intent,
}: ComposingIndicatorProps) => {
  const steps = useMemo(() => {
    const dynamicSteps = [...BASE_STEPS];
    if (typeof sourceCount === 'number' && sourceCount > 0) {
      dynamicSteps[1] = `Checking ${sourceCount} source${sourceCount === 1 ? '' : 's'}`;
    }
    if (typeof contextItems === 'number' && contextItems > 0) {
      dynamicSteps[2] = `Connecting ${contextItems} context item${contextItems === 1 ? '' : 's'}`;
    }
    return dynamicSteps;
  }, [contextItems, sourceCount]);
  const [activeStep, setActiveStep] = useState(contentStarted ? 3 : 0);

  useEffect(() => {
    if (contentStarted) {
      setActiveStep(3);
    }

    const interval = window.setInterval(() => {
      setActiveStep((current) => {
        const floor = contentStarted ? 3 : 0;
        const next = current + 1;
        return next >= steps.length ? floor : next;
      });
    }, contentStarted ? 1800 : 1400);

    return () => window.clearInterval(interval);
  }, [contentStarted, steps.length]);

  const intentLabel = formatIntent(intent);
  const visibleSteps = compact ? steps.slice(Math.max(0, activeStep - 1), activeStep + 1) : steps;

  return (
    <div
      className={`composing-indicator ${compact ? 'composing-indicator--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Assistant is composing a response"
    >
      <div className="composing-indicator__header">
        <span className="composing-indicator__pulse" aria-hidden>
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="composing-indicator__title-wrap">
          <span className="composing-indicator__title">Composing</span>
          <span className="composing-indicator__stage">{steps[activeStep]}</span>
        </div>
        <span className="composing-indicator__wave" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>

      {showReasoning && (
        <div className="composing-indicator__reasoning">
          <div className="composing-indicator__reasoning-head">
            <span>Reasoning summary</span>
            {(intentLabel || activePersona) && (
              <span className="composing-indicator__meta">
                {[intentLabel, activePersona].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="composing-indicator__steps">
            {visibleSteps.map((step) => {
              const stepIndex = steps.indexOf(step);
              const complete = stepIndex < activeStep;
              const active = stepIndex === activeStep;
              return (
                <div
                  key={`${step}-${stepIndex}`}
                  className={`composing-indicator__step ${
                    complete ? 'is-complete' : active ? 'is-active' : ''
                  }`}
                >
                  {complete ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Circle className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
