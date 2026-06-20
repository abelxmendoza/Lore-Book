/**
 * Chat lifecycle simulation — drives thread list + conversation UI through the
 * same mutation paths as production (createThread, mutateThreadMessages, touchActivity).
 *
 * Used for animation QA in demo/dev; gated via isChatLifecycleSimulationEnabled().
 * Production can enable with VITE_CHAT_LIFECYCLE_SIM=true for staged rollout testing.
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
  | { type: 'assistantStream'; content: string; chunkSize?: number; chunkDelayMs?: number }
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
  { stage: 'analyzing', progress: 18, ms: 380 },
  { stage: 'searching', progress: 38, ms: 420 },
  { stage: 'connecting', progress: 58, ms: 360 },
  { stage: 'reasoning', progress: 74, ms: 340 },
  { stage: 'generating', progress: 88, ms: 280 },
];

export function isChatLifecycleSimulationEnabled(): boolean {
  const flag = import.meta.env.VITE_CHAT_LIFECYCLE_SIM as string | undefined;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return import.meta.env.DEV || shouldUseMockData();
}

export const CHAT_LIFECYCLE_SCENARIOS: ChatLifecycleScenario[] = [
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
  chunkDelayMs = 22
): Promise<void> {
  const assistantId = `sim-assistant-${Date.now()}`;
  adapter.appendMessage(threadId, {
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: new Date(),
    isStreaming: true,
    persistStatus: 'pending',
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
    { content: accumulated, isStreaming: false, persistStatus: 'saved' },
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
          step.chunkDelayMs
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
