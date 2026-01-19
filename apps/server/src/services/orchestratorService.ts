import { integrationAggregationService } from '../integrations/integration.service';
import { logger } from '../logger';
import { spawnPython } from "../utils/pythonBridge";

import { githubSyncManager } from './github/githubSyncManager';
import { hqiService } from './hqiService';
import { memoryService } from './memoryService';
import { personaService } from './personaService';
import { taskEngineService } from './taskEngineService';

type TimelineContext = {
  events: any[];
  arcs: any[];
  season: Record<string, unknown>;
};

type IdentityContext = {
  identity: Record<string, unknown>;
  persona: Record<string, unknown>;
};

type ContinuityContext = {
  canonical: any[];
  conflicts: any[];
};

type CharacterContext = {
  character: Record<string, unknown>;
  relationships: any[];
};

type AutopilotContext = {
  daily: Record<string, unknown>;
  weekly: Record<string, unknown>;
  momentum: Record<string, unknown>;
};

type GithubContext = {
  milestones: Awaited<ReturnType<typeof githubSyncManager.listSummaries>>;
  monthlyArc: Record<string, unknown> | null;
  activityScore: number;
  identityShift: Record<string, unknown>;
};

type OrchestratorSummary = {
  timeline: TimelineContext;
  identity: IdentityContext;
  continuity: ContinuityContext;
  characters: CharacterContext[];
  tasks: any[];
  arcs: any[];
  season: Record<string, unknown>;
  autopilot: AutopilotContext;
  saga: Record<string, unknown>;
  integrations: Record<string, unknown>;
  github: GithubContext;
};

class OrchestratorService {
  private integrations = integrationAggregationService;

  private async safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      logger.warn({ error }, 'Orchestrator fallback applied');
      return fallback;
    }
  }

  private deriveIdentity(events: any[]): Record<string, unknown> {
    const tagCounts: Record<string, number> = {};
    for (const event of events) {
      const tags: string[] = event.tags ?? [];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }
    const motifs = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);
    return {
      motifs,
      emotional_slope: events.length ? Math.min(1, motifs.length / Math.max(events.length, 1)) : 0,
    } satisfies Record<string, unknown>;
  }

  private buildArcs(events: any[]): any[] {
    const arcs: Record<string, any> = {};
    events.forEach((event) => {
      const arcKey = event.chapter_id || event.chapterId || 'unassigned';
      arcs[arcKey] = arcs[arcKey] ?? { id: arcKey, title: arcKey === 'unassigned' ? 'Unassigned' : arcKey, events: [] };
      arcs[arcKey].events.push(event.id ?? event.title ?? '');
    });
    return Object.values(arcs);
  }

  private deriveSeason(arcs: any[]): Record<string, unknown> {
    if (!arcs.length) return {};
    const activeArc = arcs.find((arc) => arc.id !== 'unassigned') ?? arcs[0];
    return {
      label: 'Current Season',
      activeArc: activeArc.id,
      arcCount: arcs.length,
    } satisfies Record<string, unknown>;
  }

  private buildCharacters(events: any[]): CharacterContext[] {
    const characterMap = new Map<string, CharacterContext>();
    for (const event of events) {
      for (const name of event.characters ?? []) {
        const entry = characterMap.get(name) ?? { character: { id: name, name }, relationships: [] };
        characterMap.set(name, entry);
      }
    }

    const characters = Array.from(characterMap.values());
    characters.forEach((char, idx) => {
      const target = characters[(idx + 1) % characters.length];
      if (target) {
        char.relationships.push({ from: char.character.id, to: target.character.id, type: 'peer' });
      }
    });
    return characters;
  }

  private buildContinuity(events: any[]): ContinuityContext {
    const canonical = events.slice(0, 10).map((event) => ({
      entryId: event.id,
      fact: event.summary ?? event.content ?? event.title,
      tags: event.tags ?? [],
    }));

    const conflicts = events
      .filter((event) => (event.tags ?? []).includes('conflict'))
      .map((event) => ({
        entryId: event.id,
        type: 'tag-conflict',
        detail: event.summary ?? event.content ?? 'Conflicting tag detected',
      }));

    return { canonical, conflicts } satisfies ContinuityContext;
  }

  private buildAutopilot(tasks: any[], events: any[]): AutopilotContext {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks.filter((task) => task.due_date && task.due_date < today);
    const momentum = {
      openTasks: tasks.length,
      overdue: overdue.length,
      recentActivity: events.length,
    } satisfies Record<string, unknown>;

    return {
      daily: { focus: tasks[0]?.title ?? 'Review plan', overdue: overdue.length },
      weekly: { planned: tasks.slice(0, 5).map((task) => task.title) },
      momentum,
    } satisfies AutopilotContext;
  }

  private async buildGithubContext(userId: string): Promise<GithubContext> {
    const milestones = await this.safeCall(() => githubSyncManager.listSummaries(userId), []);
    const activityScore = milestones.reduce(
      (score, repo) => score + repo.milestones.reduce((sum, milestone) => sum + (milestone.significance ?? 0), 0),
      0
    );

    const monthlyArc = milestones.length
      ? { title: 'Monthly GitHub arc', repos: milestones.length, highlights: milestones.flatMap((m) => m.milestones.slice(0, 1)) }
      : null;

    const identityShift = {
      focus: milestones.map((item) => item.repo),
      activityScore,
    } satisfies Record<string, unknown>;

    return { milestones, monthlyArc, activityScore, identityShift } satisfies GithubContext;
  }

  private buildSaga(timeline: TimelineContext): Record<string, unknown> {
    return {
      title: 'Unified Lore Saga',
      arcs: timeline.arcs.map((arc) => arc.id ?? arc.title ?? 'unknown'),
      seasons: timeline.season,
    } satisfies Record<string, unknown>;
  }

  private async buildTimeline(userId: string): Promise<TimelineContext> {
    const events = await this.safeCall(() => memoryService.searchEntriesWithCorrections(userId, { limit: 200 }), []);
    const arcs = this.buildArcs(events);
    const season = this.deriveSeason(arcs);
    return { events, arcs, season } satisfies TimelineContext;
  }

  private async buildIdentity(userId: string, events: any[]): Promise<IdentityContext> {
    const identity = this.deriveIdentity(events);
    const persona = await this.safeCall(async () => personaService.getPersona(userId), personaService.getPersona(userId));
    return { identity, persona } satisfies IdentityContext;
  }

  private async loadTasks(userId: string): Promise<any[]> {
    return this.safeCall(() => taskEngineService.listTasks(userId, { limit: 150 }), []);
  }

  async getSummary(userId: string): Promise<OrchestratorSummary> {
    const timeline = await this.buildTimeline(userId);
    const tasks = await this.loadTasks(userId);
    const identity = await this.buildIdentity(userId, timeline.events);
    const continuity = this.buildContinuity(timeline.events);
    const autopilot = this.buildAutopilot(tasks, timeline.events);
    const characters = this.buildCharacters(timeline.events);
    const saga = this.buildSaga(timeline);
    const integrations = await this.integrations.getDistilled(userId);
    const github = await this.buildGithubContext(userId);

    return {
      timeline,
      identity,
      continuity,
      characters,
      tasks,
      arcs: timeline.arcs,
      season: timeline.season,
      autopilot,
      saga,
      integrations,
      github,
    } satisfies OrchestratorSummary;
  }

  async getTimeline(userId: string): Promise<TimelineContext> {
    return this.buildTimeline(userId);
  }

  async getIdentity(userId: string): Promise<IdentityContext> {
    const timeline = await this.buildTimeline(userId);
    return this.buildIdentity(userId, timeline.events);
  }

  async getContinuity(userId: string): Promise<ContinuityContext> {
    const timeline = await this.buildTimeline(userId);
    return this.buildContinuity(timeline.events);
  }

  async getSaga(userId: string): Promise<Record<string, unknown>> {
    const timeline = await this.buildTimeline(userId);
    return this.buildSaga(timeline);
  }

  async getCharacter(userId: string, characterId: string): Promise<CharacterContext> {
    const timeline = await this.buildTimeline(userId);
    const characters = this.buildCharacters(timeline.events);
    const match = characters.find((char) => char.character.id === characterId);
    return match ?? { character: { id: characterId }, relationships: [] };
  }

  async searchHQI(query: string): Promise<{ results: any[] }> {
    const results = hqiService.search(query, {});
    return { results };
  }

  async getFabricNeighbors(memoryId: string): Promise<{ memoryId: string; neighbors: any[] }> {
    return { memoryId, neighbors: [] };
  }
}

export const orchestratorService = new OrchestratorService();

export const runOrchestrator =
  (mode: string) =>
  async (req, res) => {
    const userId = req.user.id;

    const payload = await spawnPython("orchestrator", {
      mode,
      userId,
      id: req.params.id,
      query: req.query.query,
      memoryId: req.params.memoryId,
    });

    res.json(payload);
  };
