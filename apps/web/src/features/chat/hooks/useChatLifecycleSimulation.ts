import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatThreadContext } from '../../../contexts/ChatThreadContext';
import { useRuntimeIdentity } from '../../../hooks/useRuntimeIdentity';
import type { DemoChatLoadingStage } from '../../../services/demoChatSimulation';
import {
  CHAT_LIFECYCLE_SCENARIOS,
  getChatLifecycleScenario,
  isChatLifecycleSimulationEnabled,
  runChatLifecycleScenario,
  type ChatLifecycleAdapter,
  type ChatLifecycleRunState,
  type ChatLifecycleScenario,
} from '../services/chatLifecycleSimulation';

type UseChatLifecycleSimulationOptions = {
  sendMessage?: (text: string) => Promise<void>;
  onLoadingStage?: (stage: DemoChatLoadingStage, progress: number) => void;
};

export function useChatLifecycleSimulation(options: UseChatLifecycleSimulationOptions = {}) {
  const navigate = useNavigate();
  const { is } = useRuntimeIdentity();
  const {
    createThread,
    setActiveThreadId,
    activeThreadId,
    threads,
    mutateThreadMessagesForThread,
    updateThread,
    getThread,
  } = useChatThreadContext();

  const [runState, setRunState] = useState<ChatLifecycleRunState>({
    scenarioId: null,
    running: false,
    stepIndex: 0,
    stepLabel: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const adapter = useMemo((): ChatLifecycleAdapter => {
    return {
      createThread,
      selectThread: setActiveThreadId,
      getActiveThreadId: () => activeThreadId,
      getThreads: () => threads,
      appendMessage: (threadId, message, opts) => {
        mutateThreadMessagesForThread(threadId, (prev) => [...prev, message], opts);
      },
      updateMessage: (threadId, messageId, updates, opts) => {
        mutateThreadMessagesForThread(
          threadId,
          (prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
          opts
        );
      },
      updateThread: (threadId, updates) => {
        const { touchActivity, ...meta } = updates;
        updateThread(threadId, { ...meta, touchActivity });
      },
      navigateToThread: (threadId) => {
        navigate(`/chat/${threadId}`);
      },
      sendMessage: options.sendMessage,
      onLoadingStage: options.onLoadingStage,
    };
  }, [
    activeThreadId,
    createThread,
    mutateThreadMessagesForThread,
    navigate,
    options.onLoadingStage,
    options.sendMessage,
    setActiveThreadId,
    threads,
    updateThread,
  ]);

  const stopScenario = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState({ scenarioId: null, running: false, stepIndex: 0, stepLabel: null });
  }, []);

  const runScenario = useCallback(
    async (scenarioOrId: ChatLifecycleScenario | string) => {
      const scenario =
        typeof scenarioOrId === 'string' ? getChatLifecycleScenario(scenarioOrId) : scenarioOrId;
      if (!scenario) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunState({
        scenarioId: scenario.id,
        running: true,
        stepIndex: 0,
        stepLabel: scenario.steps[0]?.type ?? null,
      });

      try {
        await runChatLifecycleScenario(adapter, scenario, {
          signal: controller.signal,
          onStep: (index, step) => {
            setRunState((prev) => ({
              ...prev,
              stepIndex: index,
              stepLabel: step.type,
            }));
          },
        });
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setRunState({ scenarioId: scenario.id, running: false, stepIndex: scenario.steps.length, stepLabel: null });
        }
      }
    },
    [adapter]
  );

  return {
    // The QA simulator mutates visible chat state. Never expose it in an
    // authenticated runtime, even when a deployment flag is accidentally on.
    enabled: (is.guest || is.demo) && isChatLifecycleSimulationEnabled(),
    scenarios: CHAT_LIFECYCLE_SCENARIOS,
    runState,
    runScenario,
    stopScenario,
    getThread,
  };
}
