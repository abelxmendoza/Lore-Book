import type { StatusSignal } from './statusInferenceTypes';

function makeProjectSignal(
  title: string,
  status: StatusSignal['status'],
  evidence: string,
  confidence: number,
  transition?: StatusSignal['transition'],
): StatusSignal {
  return {
    attachedToType: 'project',
    inferredTitle: title,
    status,
    transition,
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
  };
}

export function inferProjectStatus(text: string): StatusSignal[] {
  const out: StatusSignal[] = [];

  if (/\b(?:working on|building)\s+LoreBook\b/i.test(text) || /\bLoreBook\b[^.!?]{0,40}\b(?:active|working on)\b/i.test(text)) {
    out.push(makeProjectSignal('LoreBook', 'active', 'working on LoreBook', 0.9, 'started'));
  }

  if (/\bLoreBook\b[^.!?]{0,60}\b(?:was paused|paused)\b/i.test(text)) {
    out.push(makeProjectSignal('LoreBook', 'paused', 'paused', 0.88, 'paused'));
  }

  if (/\bLoreBook\b[^.!?]{0,80}\b(?:started working on it again|resumed|picked it back up)\b/i.test(text)) {
    out.push(makeProjectSignal('LoreBook', 'active', 'resumed', 0.9, 'resumed'));
  }

  if (/\b(?:shipped|launched)\b/i.test(text) && /\bLoreBook\b/i.test(text)) {
    out.push(makeProjectSignal('LoreBook', 'completed', 'shipped', 0.9, 'completed'));
  }

  if (/\b(?:abandoned|on hold)\b/i.test(text)) {
    const title = /\bLoreBook\b/i.test(text) ? 'LoreBook' : 'project';
    out.push(makeProjectSignal(title, 'paused', 'abandoned/on hold', 0.8, 'paused'));
  }

  if (/\bblocked by\b/i.test(text) && /\bLoreBook\b/i.test(text)) {
    out.push(makeProjectSignal('LoreBook', 'blocked', 'blocked by', 0.86, 'blocked'));
  }

  if (/\bneed to build\b/i.test(text) && /\bLoreBook\b/i.test(text)) {
    out.push(makeProjectSignal('LoreBook', 'planned', 'need to build', 0.82));
  }

  return out;
}

export function inferProjectTransitionPairs(text: string): StatusSignal[] {
  if (!/\bLoreBook\b/i.test(text)) return [];
  const out = inferProjectStatus(text);
  if (/\bwas paused\b/i.test(text) && /\b(?:started working on it again|resumed)\b/i.test(text)) {
    const hasPaused = out.some((s) => s.status === 'paused');
    const hasResumed = out.some((s) => s.transition === 'resumed');
    if (hasPaused && hasResumed) return out;
    return [
      makeProjectSignal('LoreBook', 'paused', 'was paused', 0.88, 'paused'),
      makeProjectSignal('LoreBook', 'active', 'started working on it again', 0.9, 'resumed'),
    ];
  }
  return out;
}
