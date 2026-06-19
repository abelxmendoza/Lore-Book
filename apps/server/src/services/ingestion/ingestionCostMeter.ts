/**
 * Per-message ingestion cost meter.
 *
 * The plan (cost-efficiency Phase 1) calls for measuring "LLM detectors invoked
 * vs. detectors that returned non-empty" before investing in further
 * consolidation. This is that instrument: a tiny, allocation-cheap recorder
 * threaded through one ingestion of one message.
 *
 * Each ingestion step reports a `step` with three booleans:
 *   - eligible:   the cheap gate said the step COULD run (or there is no gate)
 *   - invoked:    the LLM call actually fired
 *   - productive: the call returned a non-empty / actionable result
 *
 * The aggregate is logged once (`ingestion.cost`) and attached to the message
 * metadata so skip-rate and waste-rate are queryable without re-running models.
 * A skipped step (eligible=false) is the win; an invoked-but-unproductive step
 * (invoked=true, productive=false) is the next gate candidate.
 */
import { logger } from '../../logger';

export interface StepRecord {
  step: string;
  eligible: boolean;
  invoked: boolean;
  productive: boolean;
}

export class IngestionCostMeter {
  private readonly steps: StepRecord[] = [];

  constructor(
    private readonly userId: string,
    private readonly messageId: string,
  ) {}

  /** Record a step outcome. `productive` defaults to false unless the call yielded something. */
  record(step: string, outcome: { eligible?: boolean; invoked: boolean; productive?: boolean }): void {
    this.steps.push({
      step,
      eligible: outcome.eligible ?? outcome.invoked,
      invoked: outcome.invoked,
      productive: outcome.productive ?? false,
    });
  }

  /** A step the cheap gate skipped — counts as eligible:false, invoked:false. */
  skipped(step: string): void {
    this.steps.push({ step, eligible: false, invoked: false, productive: false });
  }

  summary() {
    const invoked = this.steps.filter(s => s.invoked).length;
    const productive = this.steps.filter(s => s.productive).length;
    const skipped = this.steps.filter(s => !s.eligible).length;
    return {
      llmCalls: invoked,
      productiveCalls: productive,
      skippedSteps: skipped,
      wastedCalls: invoked - productive,
      steps: this.steps,
    };
  }

  /** Emit the structured log line. Call once at the end of an ingestion. */
  flush(): ReturnType<IngestionCostMeter['summary']> {
    const summary = this.summary();
    logger.info(
      { userId: this.userId, messageId: this.messageId, ...summary },
      'ingestion.cost',
    );
    return summary;
  }
}
