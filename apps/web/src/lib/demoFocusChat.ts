import type { ChatFocus } from '../types/chatFocus';
import { computeChatFocusMessageDelta, isEmotionalChatMessage } from '../types/chatFocus';

export function getDemoFocusResponse(message: string, focus: ChatFocus): string {
  const name = focus.entityName;
  const section = focus.sourceLabel;
  const stats = focus.sessionStats;
  const emotional = isEmotionalChatMessage(message);
  const { connectionDelta, affectionDelta } = computeChatFocusMessageDelta(
    focus,
    message.length,
    emotional
  );
  const baseline = focus.baseline?.affectionScore;
  const projected =
    baseline != null
      ? Math.min(100, Math.round(baseline + stats.affectionDelta + affectionDelta))
      : null;

  const deepeningLine =
    projected != null
      ? `Connection deepening: **+${connectionDelta}** this message · affection tracking toward **~${projected}%**.`
      : `Connection deepening: **+${connectionDelta}** this message in your ${section} focus.`;

  if (focus.sourceSurface === 'love') {
    if (/pattern|cycle|drift|red flag|green flag/i.test(message)) {
      return (
        `*(Demo — Love & Relationships focus on ${name})*\n\n` +
        `You opened this thread from **${section}**, so I'm weighting ${name}'s relationship patterns heavily.\n\n` +
        `${deepeningLine}\n\n` +
        `From what you've logged, there's a mix of warmth and recurring tension with ${name}. ` +
        `The pros you've named still show up in how you talk about them — but watch for the patterns you've flagged before they repeat. ` +
        `What feels most true about ${name} *right now*?`
      );
    }
    if (/how are things|going with|what should i know/i.test(message)) {
      return (
        `*(Demo — Love & Relationships focus on ${name})*\n\n` +
        `I'm pulling from your **${section}** context for **${name}** — history, flags, and recent emotional tone.\n\n` +
        `${deepeningLine}\n\n` +
        `Things with ${name} look **active but nuanced**: affection is present, and you're paying attention to how the connection *feels*, not just facts. ` +
        `That's exactly the kind of sharing that deepens how LoreBook tracks this bond in demo mode.`
      );
    }
    return (
      `*(Demo — Love & Relationships focus on ${name})*\n\n` +
      `You're chatting from **${section}** about **${name}**, so I'm prioritizing feelings, attachment, and relationship dynamics.\n\n` +
      `${deepeningLine}\n\n` +
      `I hear you. In a full session I'd weave this into ${name}'s relationship card — patterns, drift, and what this moment adds to the picture. ` +
      `Keep going; each focused message nudges the connection stats you see above the composer.`
    );
  }

  if (focus.sourceSurface === 'characters') {
    return (
      `*(Demo — Characters focus on ${name})*\n\n` +
      `Opened from **${section}** — I'm treating **${name}** as the anchor for this reply.\n\n` +
      `${deepeningLine}\n\n` +
      `I'd connect this to what you already know about ${name}: roles, ties, and gaps in their profile. ` +
      `Fill in unknown fields from the character book the same way — they'll land here with this focus chip.`
    );
  }

  if (focus.sourceSurface === 'projects') {
    return (
      `*(Demo — Projects focus)*\n\n` +
      `Tracking **${name}** from **${section}**.\n\n` +
      `${deepeningLine}\n\n` +
      `Status, blockers, and next steps for this project thread would update here. What changed since you last worked on it?`
    );
  }

  return (
    `*(Demo — ${section} focus)*\n\n` +
    `Focused on **${name}** from **${section}**.\n\n` +
    `${deepeningLine}\n\n` +
    `In demo mode this simulates how modal → main chat carries context and deepens the relevant stats in the UI.`
  );
}

/** Simulates SSE streaming for offline / demo focus chat. */
export async function streamDemoFocusReply(
  text: string,
  onChunk: (chunk: string) => void,
  opts?: { chunkSize?: number; delayMs?: number }
): Promise<void> {
  const chunkSize = opts?.chunkSize ?? 14;
  const delayMs = opts?.delayMs ?? 28;
  for (let i = 0; i < text.length; i += chunkSize) {
    onChunk(text.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
