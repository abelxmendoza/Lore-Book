import cron from 'node-cron';
import { logger } from '../logger';
import { ContinuityEnrichmentPipeline } from '../services/continuityRuntime/enrichmentPipeline';

import { WisdomEngine } from '../services/wisdom/wisdomEngine';
import { LearningEngine } from '../services/learning/learningEngine';
import { GrowthEngine } from '../services/growth/growthEngine';
import { GrowthStorage } from '../services/growth/growthStorage';
import { ResilienceEngine } from '../services/resilience/resilienceEngine';
import { ResilienceStorage } from '../services/resilience/resilienceStorage';
import { ValuesEngine } from '../services/values/valuesEngine';
import { ValuesStorage } from '../services/values/valuesStorage';
import { HabitEngine } from '../services/habits/habitEngine';
import { HabitStorage } from '../services/habits/habitStorage';
import { InfluenceEngine } from '../services/influence/influenceEngine';
import { InfluenceStorage } from '../services/influence/influenceStorage';
import { arcInferenceService } from '../services/continuityRuntime/arcs/arcInferenceService';
import { arcReconciliationService } from '../services/continuityRuntime/arcs/arcReconciliationService';
import { arcMembershipSuggestionService } from '../services/continuityRuntime/arcs/arcMembershipSuggestionService';
import { FlowDetector } from '../services/creative/flowDetector';
import { CreativeStorage } from '../services/creative/creativeStorage';
import { InterventionEngine } from '../services/intervention/interventionEngine';
import { SocialNetworkEngine } from '../services/social/socialNetworkEngine';
import { SocialStorage } from '../services/social/socialStorage';
import { TimeEngine } from '../services/time/timeEngine';
import { TimeStorage } from '../services/time/timeStorage';
import { mainLifestoryService } from '../services/mainLifestoryService';
import { trainingDataCollector } from '../services/activeLearning/trainingDataCollector';

export const enrichmentPipeline = new ContinuityEnrichmentPipeline();

// ─── ENRICHMENT — entry analyzers (per-journal-entry) ────────────────────────

const wisdomEngine = new WisdomEngine();
enrichmentPipeline.registerEntryAnalyzer({
  name: 'wisdom',
  tier: 'ENRICHMENT',
  async processEntry(userId, entry) {
    await wisdomEngine.extractFromEntry(userId, entry.id, entry.content, entry.date);
  },
});

const learningEngine = new LearningEngine();
enrichmentPipeline.registerEntryAnalyzer({
  name: 'learning',
  tier: 'ENRICHMENT',
  async processEntry(userId, entry) {
    await learningEngine.extractFromEntry(userId, entry.id, entry.content, entry.date);
  },
});

// ─── ENRICHMENT — user analyzers (full-history, run nightly) ─────────────────

const growthEngine = new GrowthEngine();
const growthStorage = new GrowthStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'growth',
  tier: 'ENRICHMENT',
  async processUser(userId) {
    const result = await growthEngine.process(userId);
    await growthStorage.saveSignals(result.signals);
    await growthStorage.saveInsights(result.insights);
  },
});

const resilienceEngine = new ResilienceEngine();
const resilienceStorage = new ResilienceStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'resilience',
  tier: 'ENRICHMENT',
  async processUser(userId) {
    const result = await resilienceEngine.process(userId);
    await resilienceStorage.saveSetbacks(result.setbacks);
    await resilienceStorage.saveInsights(result.insights);
  },
});

const valuesEngine = new ValuesEngine();
const valuesStorage = new ValuesStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'values',
  tier: 'ENRICHMENT',
  async processUser(userId) {
    const result = await valuesEngine.process(userId);
    await valuesStorage.saveValueSignals(result.valueSignals ?? []);
    await valuesStorage.saveBeliefSignals(result.beliefSignals ?? []);
    await valuesStorage.saveInsights(result.insights);
  },
});

const habitEngine = new HabitEngine();
const habitStorage = new HabitStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'habits',
  tier: 'ENRICHMENT',
  async processUser(userId) {
    const result = await habitEngine.process(userId);
    await habitStorage.saveHabits(result.habits);
    await habitStorage.saveInsights(result.insights);
  },
});

// ─── ENRICHMENT — flow state detection (per-entry) ───────────────────────────

const flowDetector = new FlowDetector();
const creativeStorage = new CreativeStorage();
enrichmentPipeline.registerEntryAnalyzer({
  name: 'flow-state',
  tier: 'ENRICHMENT',
  async processEntry(userId, entry) {
    const states = flowDetector.detect([{ id: entry.id, content: entry.content, date: entry.date }]);
    if (states.length === 0) return;
    states.forEach(s => { s.user_id = userId; });
    await creativeStorage.saveFlowStates(states);
  },
});

// ─── EXPERIMENTAL — user analyzers ───────────────────────────────────────────

const influenceEngine = new InfluenceEngine();
const influenceStorage = new InfluenceStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'influence',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    const result = await influenceEngine.process(userId);
    await influenceStorage.saveProfiles(result.profiles);
    await influenceStorage.saveEvents(result.events);
    await influenceStorage.saveInsights(result.insights);
  },
});

enrichmentPipeline.registerUserAnalyzer({
  name: 'arc-inference',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    await arcInferenceService.runForUser(userId);
  },
});

enrichmentPipeline.registerUserAnalyzer({
  name: 'arc-reconciliation',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    await arcReconciliationService.runForUser(userId);
  },
});

enrichmentPipeline.registerUserAnalyzer({
  name: 'arc-membership-suggestion',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    await arcMembershipSuggestionService.runForUser(userId);
  },
});

const interventionEngine = new InterventionEngine();
enrichmentPipeline.registerUserAnalyzer({
  name: 'intervention',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    await interventionEngine.process(userId, true);
  },
});

const socialEngine = new SocialNetworkEngine();
const socialStorage = new SocialStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'social-network',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    const result = await socialEngine.process(userId);
    await Promise.all([
      socialStorage.saveNodes(userId, result.nodes),
      socialStorage.saveEdges(result.edges),
      socialStorage.saveCommunities(result.communities),
      socialStorage.saveInfluenceScores(result.influence),
      socialStorage.saveToxicitySignals(result.toxic),
      socialStorage.saveDriftEvents(result.drift),
      socialStorage.saveNetworkScore(userId, result.score),
      socialStorage.saveInsights(result.insights ?? []),
    ]);
  },
});

const timeEngine = new TimeEngine();
const timeStorage = new TimeStorage();
enrichmentPipeline.registerUserAnalyzer({
  name: 'time-management',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    const result = await timeEngine.process(userId);
    await Promise.all([
      timeStorage.saveTimeEvents(result.events),
      timeStorage.saveTimeBlocks(result.blocks),
      timeStorage.saveProcrastinationSignals(result.procrastination),
      timeStorage.saveEnergyCurve(userId, result.energy),
      timeStorage.saveTimeScore(userId, result.score),
      timeStorage.saveInsights(result.insights ?? []),
    ]);
  },
});

// ─── ENRICHMENT — biography (nightly full-life refresh) ──────────────────────

enrichmentPipeline.registerUserAnalyzer({
  name: 'biography',
  tier: 'ENRICHMENT',
  async processUser(userId) {
    await mainLifestoryService.ensureMainLifestory(userId);
  },
});

// ─── EXPERIMENTAL — active learning (build fine-tuning datasets from corrections) ─

enrichmentPipeline.registerUserAnalyzer({
  name: 'training-data-build',
  tier: 'EXPERIMENTAL',
  async processUser(userId) {
    await Promise.allSettled([
      trainingDataCollector.buildDataset(userId, 'entity'),
      trainingDataCollector.buildDataset(userId, 'sentiment'),
      trainingDataCollector.buildDataset(userId, 'relationship'),
    ]);
  },
});

// ─── Cron registration ────────────────────────────────────────────────────────

export function registerEnrichmentJob(): void {
  const { entry, user } = enrichmentPipeline.registeredAnalyzers;
  logger.info({ entryAnalyzers: entry, userAnalyzers: user }, 'Registering enrichment pipeline');

  // Run daily at 4:00 AM — after continuity engine (3:00 AM)
  cron.schedule('0 4 * * *', async () => {
    logger.info('enrichment.job: starting nightly user enrichment run');
    await enrichmentPipeline.runForAllUsers();
    logger.info('enrichment.job: nightly user enrichment complete');
  });

  logger.info('enrichment.job registered (runs at 4:00 AM daily)');
}
