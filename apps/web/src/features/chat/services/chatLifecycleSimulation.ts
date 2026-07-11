/**
 * Chat lifecycle simulation — drives thread list + conversation UI through the
 * same mutation paths as production (createThread, mutateThreadMessages, touchActivity).
 *
 * Used for animation QA in demo/dev; gated via isChatLifecycleSimulationEnabled().
 * Production can enable with VITE_CHAT_LIFECYCLE_SIM=true for staged preview testing.
 * The React hook additionally requires a guest or demo runtime.
 */

import type { Message } from '../message/ChatMessage';
import type { ChatThread } from '../hooks/useChatThreads';
import { streamDemoFocusReply } from '../../../lib/demoFocusChat';
import { buildDemoChatResponse, deriveDemoThreadTitle, type DemoChatLoadingStage } from '../../../services/demoChatSimulation';
import { deriveTitleFromFirstUserMessage } from '../utils/threadTitleUtils';
import { shouldUseMockData } from '../../../hooks/useShouldUseMockData';

export type ChatLifecycleAdapter = {
  createThread: () => string;
  selectThread: (threadId: string) => void;
  getActiveThreadId: () => string | null;
  getThreads: () => ChatThread[];
  appendMessage: (threadId: string, message: Message, opts?: { touchActivity?: boolean }) => void;
  updateMessage: (
    threadId: string,
    messageId: string,
    updates: Partial<Message>,
    opts?: { touchActivity?: boolean }
  ) => void;
  updateThread: (
    threadId: string,
    updates: Partial<Pick<ChatThread, 'title' | 'subtitle' | 'dominantEntities'>> & { touchActivity?: boolean }
  ) => void;
  navigateToThread: (threadId: string) => void;
  /** Full send path (useChat.sendMessage) — optional; used when testing production streaming. */
  sendMessage?: (text: string) => Promise<void>;
  onLoadingStage?: (stage: DemoChatLoadingStage, progress: number) => void;
};

export type ChatLifecycleStep =
  | { type: 'wait'; ms: number }
  | { type: 'createThread'; select?: boolean }
  | { type: 'selectThread'; threadId: 'active' | 'first' | 'second' | string }
  | { type: 'navigate'; threadId: 'active' | string }
  | { type: 'userMessage'; content: string; touchActivity?: boolean }
  | {
      type: 'assistantStream';
      content: string;
      chunkSize?: number;
      chunkDelayMs?: number;
      /** Structured production-style result fields rendered after streaming completes. */
      result?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'timestamp' | 'isStreaming'>>;
    }
  | { type: 'updateThreadMeta'; title?: string; subtitle?: string; dominantEntities?: string[]; touchActivity?: boolean }
  | { type: 'sendViaComposer'; content: string };

export type ChatLifecycleScenario = {
  id: string;
  label: string;
  description: string;
  steps: ChatLifecycleStep[];
};

export type ChatLifecycleRunState = {
  scenarioId: string | null;
  running: boolean;
  stepIndex: number;
  stepLabel: string | null;
};

const STAGE_SEQUENCE: Array<{ stage: DemoChatLoadingStage; progress: number; ms: number }> = [
  { stage: 'analyzing', progress: 18, ms: 520 },
  { stage: 'searching', progress: 38, ms: 560 },
  { stage: 'connecting', progress: 58, ms: 500 },
  { stage: 'reasoning', progress: 74, ms: 480 },
  { stage: 'generating', progress: 88, ms: 400 },
];

/** Breathing room after a reply before the simulated user continues. */
const SHOWCASE_TURN_PAUSE_MS = 1_800;

export function isChatLifecycleSimulationEnabled(): boolean {
  const flag = import.meta.env.VITE_CHAT_LIFECYCLE_SIM as string | undefined;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return import.meta.env.DEV || shouldUseMockData();
}

export const CHAT_LIFECYCLE_SCENARIOS: ChatLifecycleScenario[] = [
  {
    id: 'party-story',
    label: 'Party story',
    description: 'Three turns: event capture, people and place linking, emotion, recall, and timeline.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 600 },
      {
        type: 'userMessage',
        content: 'I went to an Anime Expo afterparty at Catch One last night with Maya and Jordan. It was packed but honestly amazing.',
        touchActivity: true,
      },
      {
        type: 'assistantStream',
        content: 'That sounds like the kind of night that leaves you tired but still buzzing the next day. Being packed into Catch One after Anime Expo could have been exhausting, but calling it “honestly amazing” makes me think the people you were with mattered more than the crowd.\n\nWas there one moment—or one person—that made the night feel especially worth it?',
        result: {
          mentionedEntities: [
            { id: 'sim-event-anime-expo', name: 'Anime Expo Afterparty', type: 'event', loreKind: 'event' },
            { id: 'sim-place-catch-one', name: 'Catch One', type: 'location', loreKind: 'place' },
            { id: 'sim-person-maya', name: 'Maya', type: 'character', loreKind: 'person' },
            { id: 'sim-person-jordan', name: 'Jordan', type: 'character', loreKind: 'person' },
          ],
          connections: ['Event · Anime Expo Afterparty', 'Place · Catch One', 'People · Maya and Jordan'],
          timelineUpdates: ['📅 Added Anime Expo afterparty · last night', '📍 Linked Catch One'],
          extractedDates: [{ date: 'last night', context: 'Anime Expo afterparty at Catch One' }],
          creationOutcomes: [
            { mention: 'Anime Expo Afterparty', action: 'create', entityId: 'sim-event-anime-expo', entityName: 'Anime Expo Afterparty', authority: 'core' },
            { mention: 'Maya', action: 'merge', entityId: 'sim-person-maya', entityName: 'Maya', authority: 'core' },
          ],
          creationOutcomeSummary: 'Created the event and linked known people with correction controls.',
          continuityAcknowledged: { signals: ['emotion', 'social event'], entityHints: ['Maya linked', 'Jordan linked', 'Catch One linked'], timelineSignificant: true },
          suggestedActions: [{ id: 'party-people', label: 'Tell me about Maya', kind: 'prefill', prompt: 'I spent the most time with Maya because…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Mostly Maya. We danced for hours, and she introduced me to her friend Leo from Long Beach.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'Dancing with Maya for hours sounds like more than just being at the same party—you two kept choosing to stay in each other’s orbit. And being introduced to Leo suggests she was bringing you into her social world, at least in that moment. That does not automatically mean romance, but it does explain why this part of the night stayed vivid for you.\n\nHow did you feel around Maya: playful, comfortable, nervous, seen—or something else?',
        result: {
          mentionedEntities: [
            { id: 'sim-person-maya', name: 'Maya', type: 'character', loreKind: 'person' },
            { id: 'sim-person-leo', name: 'Leo', type: 'character', loreKind: 'person' },
            { id: 'sim-place-long-beach', name: 'Long Beach', type: 'location', loreKind: 'place' },
          ],
          connections: ['Relationship context · Maya', 'Introduced by Maya · Leo', 'Place context · Long Beach'],
          timelineUpdates: ['👤 Maya marked as central to this event', '👤 Added Leo as a tentative new person'],
          creationOutcomes: [{ mention: 'Leo', action: 'defer', entityName: 'Leo', reason: 'New person held for confirmation before creating a durable profile.', authority: 'core' }],
          creationOutcomeSummary: 'Known entities merged; one new person awaits confirmation.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Anime Expo afterparty', snippet: 'Catch One with Maya and Jordan' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'What will you remember about the night?', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'What stands out is not simply that you went to a party. You entered a loud, crowded space that could easily have overwhelmed you, yet you found a connection strong enough to make the night feel amazing. You spent hours with Maya, let yourself be social, and met someone new through her.\n\nThe part I would hold onto is this: the right company may change how you experience environments that normally drain you. That might be worth noticing again the next time you are deciding whether to go out.',
        result: {
          response_mode: 'RECALL',
          recall_sources: [{ entry_id: 'sim-party-entry', timestamp: new Date().toISOString(), summary: 'Anime Expo afterparty at Catch One', emotions: ['excited', 'overwhelmed'], entities: ['Maya', 'Jordan', 'Leo', 'Catch One'] }],
          confidence_label: 'High confidence from this conversation',
          citations: [{ text: 'Anime Expo afterparty at Catch One', sourceId: 'sim-party-entry', sourceType: 'entry' }],
          suggestedActions: [{ id: 'party-timeline', label: 'Open timeline', kind: 'navigate', surface: 'timeline' }],
        },
      },
      { type: 'updateThreadMeta', title: 'Anime Expo afterparty', subtitle: 'Social life · emotions · memory', dominantEntities: ['Maya', 'Catch One', 'Leo'], touchActivity: true },
    ],
  },
  {
    id: 'romantic-interest',
    label: 'Romantic interest',
    description: 'Three turns: uncertainty-aware relationship tracking, patterns, boundaries, and guidance.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'userMessage', content: 'I think I might like Maya. At the party she kept finding reasons to stay near me, but I do not want to assume she feels the same.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'You seem to be doing two things at once: letting yourself feel excited and trying to protect both of you from a story that may not be true yet. That restraint is healthy, but be careful not to use “I don’t want to assume” as a reason to dismiss your own feelings entirely. You are allowed to like her before you know what she feels.\n\nWhat moments made you feel close to her—and which parts are you most afraid of misreading?',
        result: {
          mentionedEntities: [{ id: 'sim-person-maya', name: 'Maya', type: 'character', loreKind: 'person', characterVariant: 'romantic' }],
          connections: ['Romantic interest · Maya', 'Evidence context · Anime Expo afterparty'],
          continuityWarnings: ['Maya’s feelings are not confirmed; observations remain separate from interpretation.'],
          modeDecision: { mode: 'SOCIAL_FOCUS', confidence: 0.93, reasoning: 'Relationship reflection with uncertainty preserved.' },
          suggestedActions: [{ id: 'romance-evidence', label: 'Describe the moments', kind: 'prefill', prompt: 'The moments that stood out were…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'She held my hand through the crowd and texted me afterward that she got home safe. I felt calm around her, not anxious like I usually do.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'Holding your hand through the crowd could have been practical, affectionate, or both; the text afterward shows care, but it still does not answer the romantic question by itself. The more revealing detail may be yours: you felt calm.\n\nIf attraction usually makes you anxious, calmness might feel less dramatic and therefore easier to overlook. But feeling safe enough to be present can be a stronger foundation than the familiar rush of uncertainty. What do you think was different with her?',
        result: {
          connections: ['Observed behavior · held hands', 'Observed behavior · follow-up text', 'Emotional pattern · calm versus anxious'],
          timelineUpdates: ['💞 Added a relationship moment with Maya', '🧭 Noted a change in your emotional pattern'],
          strategicGuidance: 'Stay curious and direct. A low-pressure invitation gives Maya room to answer without treating ambiguous signals as certainty.',
          sources: [{ type: 'entry', id: 'sim-party-entry', title: 'Anime Expo afterparty', snippet: 'Spent most of the night with Maya' }],
          suggestedActions: [{ id: 'romance-next', label: 'Plan a low-pressure invite', kind: 'prefill', prompt: 'Help me invite Maya to coffee without making it awkward.' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Help me decide what to do next without overthinking it.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'You do not need to solve her feelings before taking one honest, low-stakes step. Ask for something specific and easy to answer: “I had a really good time with you at the party. Want to grab coffee this week?”\n\nThat gives you real information instead of more clues to analyze. If she says yes, stay curious rather than treating it as proof of anything. If she is vague or declines, you will have protected your dignity by being clear without overexposing yourself. The goal is not to eliminate uncertainty—it is to respond to it with honesty.',
        result: {
          modeDecision: { mode: 'STRATEGIC', confidence: 0.96, reasoning: 'User requested concrete relationship guidance.' },
          strategicGuidance: 'Send one direct invitation, then let the response provide new evidence.',
          suggestedActions: [
            { id: 'romance-draft', label: 'Draft the text', kind: 'prefill', prompt: 'Draft a casual coffee invitation to Maya.' },
            { id: 'romance-fork', label: 'Explore my anxiety pattern', kind: 'fork', prompt: 'Why did feeling calm with Maya stand out to me?' },
          ],
        },
      },
      { type: 'updateThreadMeta', title: 'How I feel about Maya', subtitle: 'Romance · uncertainty · next step', dominantEntities: ['Maya', 'Anime Expo Afterparty'], touchActivity: true },
    ],
  },
  {
    id: 'conflict-repair',
    label: 'Conflict & repair',
    description: 'Three turns: competing perspectives, correction, boundaries, repair plan, and continuity.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'userMessage', content: 'Jordan got mad at me after the party because I disappeared with Maya. He said I always ditch my friends when I like someone.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'That accusation probably lands hard because there may be a real hurt underneath an unfair word like “always.” Jordan may genuinely have felt abandoned, while his version of your character is still not automatically true. You do not have to choose between taking his feelings seriously and defending yourself from a sweeping label.\n\nBefore deciding how to respond, what actually happened from your point of view—and had you two made a plan to stay together?',
        result: {
          mentionedEntities: [
            { id: 'sim-person-jordan', name: 'Jordan', type: 'character', loreKind: 'person' },
            { id: 'sim-person-maya', name: 'Maya', type: 'character', loreKind: 'person', characterVariant: 'romantic' },
          ],
          connections: ['Conflict · Jordan', 'Shared event · Anime Expo afterparty', 'Context · Maya'],
          continuityWarnings: ['“Always ditches friends” is attributed to Jordan, not stored as established truth.'],
          modeDecision: { mode: 'SUPPORTIVE', confidence: 0.94, reasoning: 'Conflict processing before advice.' },
          suggestedActions: [{ id: 'conflict-view', label: 'Tell my side', kind: 'prefill', prompt: 'From my point of view…' }],
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'Actually, he was not mad that night. He texted me the next morning. I lost track of time and should have checked in.', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'That changes the emotional picture. He did not confront you in the heat of the moment; he sat with it and contacted you the next morning. And you are already able to name your part without collapsing into self-blame: you lost track of time, and a check-in would have been considerate.\n\nThe useful distinction is between intention and impact. You may not have meant to ditch him, but he still experienced being left behind. Owning that specific impact is enough—you do not need to agree that it defines a permanent pattern.',
        result: {
          timelineUpdates: ['✏️ Corrected conflict timing to the next morning', '📅 Preserved party → follow-up sequence'],
          extractedDates: [{ date: 'next morning', context: 'Jordan raised the conflict by text' }],
          staleProjectionHints: [{ id: 'sim-party-summary', type: 'timeline_event', title: 'Party conflict timing', summary: 'Earlier summary may say the conflict happened at the party.' }],
          staleProjectionSummary: 'A prior derived summary needs refresh after your correction.',
          creationOutcomes: [{ mention: 'Jordan conflict timing', action: 'merge', entityId: 'sim-event-party-followup', entityName: 'Morning follow-up', reason: 'Corrected chronology merged into the existing event thread.', authority: 'core' }],
          creationOutcomeSummary: 'Correction applied without duplicating the event.',
        },
      },
      { type: 'wait', ms: SHOWCASE_TURN_PAUSE_MS },
      { type: 'userMessage', content: 'I want to apologize without agreeing that I always ditch people. What should I say?', touchActivity: true },
      {
        type: 'assistantStream',
        content: 'I would keep the apology focused on repair first and save the boundary for after he feels heard:\n\n“I’m sorry I disappeared and didn’t check in. I lost track of time, but I understand why it felt like I left you hanging. You matter to me, and next time I’ll tell you before I split off.”\n\nThen, if the conversation is calm: “I also want to talk about the word ‘always.’ I can own what happened that night, but I don’t want us to turn one conflict into a judgment about who I am.”\n\nSeparating those two parts matters. If you defend yourself inside the apology, he may only hear the defense. If you never address the label, resentment may linger for you.',
        result: {
          strategicGuidance: 'Acknowledge the concrete behavior, validate impact, name a future action, and set a boundary around the global accusation.',
          connections: ['Repair attempt · Jordan', 'Boundary · reject global label', 'Commitment · check in next time'],
          suggestedActions: [
            { id: 'conflict-copy', label: 'Make it sound like me', kind: 'prefill', prompt: 'Rewrite that apology in a more casual tone.' },
            { id: 'conflict-fork', label: 'Explore the friendship pattern', kind: 'fork', prompt: 'Has this tension with Jordan happened before?' },
          ],
        },
      },
      { type: 'updateThreadMeta', title: 'Repairing things with Jordan', subtitle: 'Conflict · accountability · boundaries', dominantEntities: ['Jordan', 'Maya', 'Anime Expo Afterparty'], touchActivity: true },
    ],
  },
  {
    id: 'live-reply',
    label: 'Live reply',
    description: 'New thread, user message, staged loading, streaming assistant reply.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 400 },
      {
        type: 'userMessage',
        content: 'Professor Smith helped me debug my ROS 2 launch file today — Omega-1 finally moves in Gazebo.',
        touchActivity: true,
      },
      { type: 'wait', ms: 500 },
      {
        type: 'assistantStream',
        content:
          'That is a real milestone. Launch files and Gazebo sim are where robotics projects stop being abstract — Omega-1 moving means your CSUF lab work is compounding.\n\nI would link **Professor Smith**, **ROS 2**, and **Omega-1** on your timeline. Want to capture what finally clicked?',
      },
      {
        type: 'updateThreadMeta',
        title: 'ROS 2 launch breakthrough',
        subtitle: 'Robotics · mentor',
        dominantEntities: ['Professor Smith', 'ROS 2', 'Omega-1'],
        touchActivity: true,
      },
    ],
  },
  {
    id: 'thread-bump',
    label: 'Thread bump',
    description: 'Reactivate an older thread — sidebar reorder + message enter animations.',
    steps: [
      { type: 'selectThread', threadId: 'second' },
      { type: 'wait', ms: 600 },
      {
        type: 'userMessage',
        content: 'Picking this back up — Alex and I are planning another Mission Beach weekend.',
        touchActivity: true,
      },
      { type: 'wait', ms: 450 },
      {
        type: 'assistantStream',
        content:
          'Good thread to revive. Mission Beach keeps showing up as a reset place for you and Alex — worth noting as a recurring pattern.',
        chunkSize: 10,
        chunkDelayMs: 28,
      },
    ],
  },
  {
    id: 'multi-turn',
    label: 'Multi-turn',
    description: 'Two conversational turns with pauses — tests sequential message enters.',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 350 },
      { type: 'userMessage', content: 'Had coffee with Marcus — he might know someone at Vanguard Robotics.', touchActivity: true },
      { type: 'wait', ms: 700 },
      {
        type: 'assistantStream',
        content: 'Marcus keeps surfacing as a connector in your network. I would log this as a career lead thread.',
      },
      { type: 'wait', ms: 900 },
      { type: 'userMessage', content: 'Yeah — I want my robotics skills linked if I follow up.', touchActivity: true },
      { type: 'wait', ms: 600 },
      {
        type: 'assistantStream',
        content: 'Done — your skill profile and this thread can stay linked so interview prep stays in one place.',
      },
      {
        type: 'updateThreadMeta',
        title: 'Vanguard Robotics lead',
        subtitle: 'Career · network',
        dominantEntities: ['Marcus', 'Vanguard Robotics'],
      },
    ],
  },
  {
    id: 'composer-send',
    label: 'Composer send',
    description: 'Uses the full sendMessage path (same as typing + Enter in production).',
    steps: [
      { type: 'createThread', select: true },
      { type: 'wait', ms: 300 },
      { type: 'sendViaComposer', content: 'Log this: Jordan and I ran Golden Gate Park again — felt like our usual Sunday ritual.' },
    ],
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveThreadId(
  adapter: ChatLifecycleAdapter,
  ref: ChatLifecycleStep & { type: 'selectThread' | 'navigate' },
  activeThreadId: string | null
): string | null {
  if (ref.threadId === 'active') return activeThreadId;
  if (ref.threadId === 'first') return adapter.getThreads()[0]?.id ?? null;
  if (ref.threadId === 'second') return adapter.getThreads()[1]?.id ?? null;
  return ref.threadId;
}

async function runLoadingStages(adapter: ChatLifecycleAdapter): Promise<void> {
  for (const step of STAGE_SEQUENCE) {
    adapter.onLoadingStage?.(step.stage, step.progress);
    await sleep(step.ms);
  }
  adapter.onLoadingStage?.('generating', 100);
}

async function streamAssistantReply(
  adapter: ChatLifecycleAdapter,
  threadId: string,
  content: string,
  chunkSize = 12,
  chunkDelayMs = 42,
  result?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'timestamp' | 'isStreaming'>>
): Promise<void> {
  const assistantId = `sim-assistant-${Date.now()}`;
  adapter.appendMessage(threadId, {
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isStreaming: true,
    persistStatus: 'pending',
    activePersona: 'LoreBook',
    ragStats: {
      sourceCount: 3,
      cacheHit: false,
      retrievalMs: 220,
      contextItems: 5,
    },
    modeDecision: {
      mode: 'story_context',
      confidence: 0.82,
      reasoning: 'Demo mode is simulating source lookup, context connection, and response drafting.',
    },
    metadata: {
      intent: 'story_context',
      why: 'Demo mode is showing the composing flow with a visible reasoning summary.',
    },
    ...result,
  });

  await runLoadingStages(adapter);

  let accumulated = '';
  await streamDemoFocusReply(
    content,
    (chunk) => {
      accumulated += chunk;
      adapter.updateMessage(threadId, assistantId, { content: accumulated, isStreaming: true });
    },
    { chunkSize, delayMs: chunkDelayMs }
  );

  adapter.updateMessage(
    threadId,
    assistantId,
    { ...result, content: accumulated, isStreaming: false, persistStatus: 'saved' },
    { touchActivity: true }
  );
}

export async function runChatLifecycleScenario(
  adapter: ChatLifecycleAdapter,
  scenario: ChatLifecycleScenario,
  options?: { signal?: AbortSignal; onStep?: (index: number, step: ChatLifecycleStep) => void }
): Promise<void> {
  let activeThreadId = adapter.getActiveThreadId();

  for (let i = 0; i < scenario.steps.length; i++) {
    if (options?.signal?.aborted) return;
    const step = scenario.steps[i];
    options?.onStep?.(i, step);

    switch (step.type) {
      case 'wait':
        await sleep(step.ms);
        break;

      case 'createThread': {
        activeThreadId = adapter.createThread();
        if (step.select !== false) {
          adapter.selectThread(activeThreadId);
          adapter.navigateToThread(activeThreadId);
        }
        break;
      }

      case 'selectThread': {
        const id = resolveThreadId(adapter, step, activeThreadId);
        if (!id) break;
        activeThreadId = id;
        adapter.selectThread(id);
        break;
      }

      case 'navigate': {
        const id = resolveThreadId(adapter, step, activeThreadId);
        if (!id) break;
        activeThreadId = id;
        adapter.navigateToThread(id);
        break;
      }

      case 'userMessage': {
        if (!activeThreadId) {
          activeThreadId = adapter.createThread();
          adapter.selectThread(activeThreadId);
          adapter.navigateToThread(activeThreadId);
        }
        const userId = `sim-user-${Date.now()}`;
        adapter.appendMessage(
          activeThreadId,
          {
            id: userId,
            role: 'user',
            content: step.content,
            timestamp: new Date(),
            persistStatus: 'pending',
          },
          { touchActivity: step.touchActivity !== false }
        );
        const thread = adapter.getThreads().find((t) => t.id === activeThreadId);
        if (thread && thread.messages.filter((m) => m.role === 'user').length === 1) {
          adapter.updateThread(activeThreadId, {
            title: deriveTitleFromFirstUserMessage(step.content) || deriveDemoThreadTitle(step.content),
            touchActivity: step.touchActivity !== false,
          });
        }
        break;
      }

      case 'assistantStream': {
        if (!activeThreadId) break;
        await streamAssistantReply(
          adapter,
          activeThreadId,
          step.content,
          step.chunkSize,
          step.chunkDelayMs,
          step.result
        );
        break;
      }

      case 'updateThreadMeta':
        if (!activeThreadId) break;
        adapter.updateThread(activeThreadId, {
          title: step.title,
          subtitle: step.subtitle,
          dominantEntities: step.dominantEntities,
          touchActivity: step.touchActivity,
        });
        break;

      case 'sendViaComposer': {
        if (!adapter.sendMessage) {
          const demo = buildDemoChatResponse(step.content);
          if (!activeThreadId) {
            activeThreadId = adapter.createThread();
            adapter.selectThread(activeThreadId);
            adapter.navigateToThread(activeThreadId);
          }
          adapter.appendMessage(
            activeThreadId,
            { id: `sim-user-${Date.now()}`, role: 'user', content: step.content, timestamp: new Date() },
            { touchActivity: true }
          );
          await streamAssistantReply(adapter, activeThreadId, demo.content);
          break;
        }
        await adapter.sendMessage(step.content);
        activeThreadId = adapter.getActiveThreadId();
        break;
      }

      default:
        break;
    }
  }
}

export function getChatLifecycleScenario(id: string): ChatLifecycleScenario | undefined {
  return CHAT_LIFECYCLE_SCENARIOS.find((s) => s.id === id);
}
