import type { PropositionDurability, TemporalScope } from './beliefTypes';

export function resolveBeliefTemporalScope(input: {
  text: string;
  durability: PropositionDurability;
  now?: Date;
}): TemporalScope {
  const now = input.now ?? new Date();
  const t = input.text.toLowerCase();
  const iso = now.toISOString();

  let referenceExpression: string | undefined;
  let occurredAt: string | undefined;
  let validFrom: string | undefined;
  let validUntil: string | undefined;
  let validAt: string | undefined;
  let confidence = 0.4;

  if (/\bnow\b|\bright now\b/.test(t)) {
    referenceExpression = 'now';
    validAt = iso;
    validFrom = iso;
    validUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
    confidence = 0.85;
  } else if (/\btonight\b/.test(t)) {
    referenceExpression = 'tonight';
    validFrom = iso;
    validUntil = endOfLocalDay(now).toISOString();
    confidence = 0.8;
  } else if (/\btomorrow\b/.test(t)) {
    referenceExpression = 'tomorrow';
    const start = startOfNextDay(now);
    validFrom = start.toISOString();
    validUntil = endOfLocalDay(start).toISOString();
    confidence = 0.8;
  } else if (/\blast night\b/.test(t)) {
    referenceExpression = 'last night';
    occurredAt = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    confidence = 0.75;
  } else if (/\byesterday\b/.test(t)) {
    referenceExpression = 'yesterday';
    occurredAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    confidence = 0.75;
  } else if (/\bsaturday\b/.test(t)) {
    referenceExpression = 'Saturday';
    confidence = 0.55;
  }

  if (input.durability === 'TEMPORARY_STATE' && !validUntil) {
    validAt = validAt ?? iso;
    validFrom = validFrom ?? iso;
    validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    confidence = Math.max(confidence, 0.7);
  }

  return {
    validAt,
    validFrom,
    validUntil,
    occurredAt,
    referenceExpression,
    resolutionConfidence: confidence,
  };
}

function endOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function startOfNextDay(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + 1);
  out.setHours(0, 0, 0, 0);
  return out;
}
