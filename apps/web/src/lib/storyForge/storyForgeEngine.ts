import { compileAllDomainBooks, compileBookFromMemory } from './bookCompilationSimulator';
import { CONVERSATION_SCENARIOS, getScenarioById } from './conversationScenarios';
import { StoryMemoryEngine } from './storyMemoryEngine';
import type { CompiledBookDraft, ConversationScenario, StoryMemoryState, TurnAnalysis } from './types';

export type StoryForgeRunResult = {
  scenario: ConversationScenario;
  memory: StoryMemoryState;
  analyses: TurnAnalysis[];
  mainBook: CompiledBookDraft;
  domainBooks: CompiledBookDraft[];
};

export type StoryForgeBatchResult = {
  scenariosRun: number;
  combinedMemory: StoryMemoryState;
  mainBook: CompiledBookDraft;
  perScenario: StoryForgeRunResult[];
};

/** Run one scripted conversation through detection → memory → versioned book compile. */
export function runStoryForgeScenario(scenarioId: string): StoryForgeRunResult | null {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) return null;

  const engine = new StoryMemoryEngine({ scenario });
  const analyses: TurnAnalysis[] = [];

  for (const turn of scenario.turns) {
    analyses.push(engine.processTurn(turn.role, turn.content));
  }

  const memory = engine.getState();
  const mainBook = compileBookFromMemory(memory, { title: scenario.title });
  const domainBooks = compileAllDomainBooks(memory).slice(1);

  return { scenario, memory, analyses, mainBook, domainBooks };
}

/** Simulate a full user's chat history by running all scenarios sequentially into one graph. */
export function runStoryForgeBatch(scenarioIds?: string[]): StoryForgeBatchResult {
  const ids = scenarioIds ?? CONVERSATION_SCENARIOS.map((s) => s.id);
  const engine = new StoryMemoryEngine();
  const perScenario: StoryForgeRunResult[] = [];

  for (const id of ids) {
    const scenario = getScenarioById(id);
    if (!scenario) continue;

    const analyses: TurnAnalysis[] = [];
    for (const turn of scenario.turns) {
      analyses.push(engine.processTurn(turn.role, turn.content));
    }

    const memory = engine.getState();
    const mainBook = compileBookFromMemory(memory, { title: scenario.title });
    perScenario.push({
      scenario,
      memory: structuredClone(memory),
      analyses,
      mainBook,
      domainBooks: compileAllDomainBooks(memory).slice(1),
    });
  }

  const combinedMemory = engine.getState();
  const mainBook = compileBookFromMemory(combinedMemory, {
    title: 'Complete Life Lore — from simulated chats',
    previousVersions: [],
  });

  return {
    scenariosRun: perScenario.length,
    combinedMemory,
    mainBook,
    perScenario,
  };
}

export { CONVERSATION_SCENARIOS, getScenarioById };
