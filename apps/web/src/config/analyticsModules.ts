import { 
  Brain, 
  Users, 
  BookOpen, 
  Network, 
  Sparkles, 
  TrendingUp, 
  AlertCircle, 
  Zap, 
  Map,
  Search,
  HeartPulse,
  Award,
  type LucideIcon
} from 'lucide-react';

export type AnalyticsModuleTier = 'core' | 'advanced' | 'lab';

export interface AnalyticsModule {
  key: string;
  title: string;
  description: string;
  tier: AnalyticsModuleTier;
  route: string;
  icon: LucideIcon;
  metrics: string[];
  defaultCharts: string[];
  apiEndpoint: string;
}

export const ANALYTICS_MODULES: AnalyticsModule[] = [
  {
    key: 'identity',
    title: 'Identity Pulse',
    description: 'Track your emotional and identity shifts over time.',
    tier: 'core',
    route: '/discovery/identity',
    icon: Brain,
    metrics: ['driftScore', 'volatility', 'identityClusterCount'],
    defaultCharts: ['sentimentTimeline', 'identityEmbeddingPlot'],
    apiEndpoint: '/api/analytics/identity'
  },
  {
    key: 'relationships',
    title: 'Relationships',
    description: 'See who shapes your emotional landscape.',
    tier: 'core',
    route: '/discovery/relationships',
    icon: Users,
    metrics: ['topInfluencer', 'maxImpactScore', 'relationshipCount'],
    defaultCharts: ['relationshipTimeline', 'interactionHeatmap'],
    apiEndpoint: '/api/analytics/relationships'
  },
  {
    key: 'characters',
    title: 'Characters',
    description: 'Character mention patterns, sentiment trends, and interaction analytics.',
    tier: 'core',
    route: '/discovery/characters',
    icon: Users,
    metrics: ['totalCharacters', 'mostMentioned', 'averageSentiment', 'activeCharacters', 'topCharacter'],
    defaultCharts: ['mentionFrequency', 'sentimentDistribution', 'interactionScores'],
    apiEndpoint: '/api/analytics/characters'
  },
  {
    key: 'saga',
    title: 'Sagas',
    description: 'Your life\'s arcs, eras, and narrative beats.',
    tier: 'core',
    route: '/discovery/saga',
    icon: BookOpen,
    metrics: ['activeSagaCount', 'arcCount', 'eraCount'],
    defaultCharts: ['sagaTimelineBands'],
    apiEndpoint: '/api/analytics/saga'
  },
  {
    key: 'memory-fabric',
    title: 'Memory Fabric',
    description: 'Clusters, bridges, and outliers in your memories.',
    tier: 'advanced',
    route: '/discovery/memory-fabric',
    icon: Network,
    metrics: ['clusterCount', 'bridgeCount', 'outlierCount'],
    defaultCharts: ['clusterScatter', 'similarityHeatmap'],
    apiEndpoint: '/api/analytics/memory-fabric'
  },
  {
    key: 'insights',
    title: 'Insights',
    description: 'Correlations, loops, and recurring patterns.',
    tier: 'core',
    route: '/discovery/insights',
    icon: Sparkles,
    metrics: ['strongestCorrelation', 'loopCount', 'stabilityScore'],
    defaultCharts: ['correlationMatrix', 'loopTimeline'],
    apiEndpoint: '/api/analytics/insights'
  },
  {
    key: 'reactions-resilience',
    title: 'Reactions & Resilience',
    description: 'How you respond to experiences and beliefs. Recovery patterns and therapeutic reflection.',
    tier: 'core',
    route: '/discovery/reactions-resilience',
    icon: HeartPulse,
    metrics: ['avgRecoveryTime', 'recurrenceRate', 'resilienceScore', 'totalReactions'],
    defaultCharts: ['recoveryTimeline', 'reactionPatterns'],
    apiEndpoint: '/api/perception-reaction-engine/stability'
  },
  {
    key: 'predictions',
    title: 'Predictions',
    description: 'Forecast where your story is heading.',
    tier: 'lab',
    route: '/discovery/predictions',
    icon: TrendingUp,
    metrics: ['forecastMood', 'riskZoneCount'],
    defaultCharts: ['forecastTimeline', 'stateTransitionGraph'],
    apiEndpoint: '/api/analytics/predictions'
  },
  {
    key: 'shadow',
    title: 'Shadow',
    description: 'Suppressed topics, negative loops, and inner archetypes.',
    tier: 'advanced',
    route: '/discovery/shadow',
    icon: AlertCircle,
    metrics: ['suppressedTopicCount', 'negativeLoopStrength', 'shadowArchetypeCount'],
    defaultCharts: ['negativeClusterMap', 'emotionalDropTimeline'],
    apiEndpoint: '/api/analytics/shadow'
  },
  {
    key: 'xp',
    title: 'XP Dashboard',
    description: 'Your life XP, levels, and streaks.',
    tier: 'advanced',
    route: '/discovery/xp',
    icon: Zap,
    metrics: ['level', 'totalXP', 'streakLength'],
    defaultCharts: ['xpTimeline', 'xpByCategory'],
    apiEndpoint: '/api/analytics/xp'
  },
  {
    key: 'achievements',
    title: 'Achievements',
    description: 'Unlocked milestones and accomplishments in your journey.',
    tier: 'advanced',
    route: '/discovery/achievements',
    icon: Award,
    metrics: ['totalAchievements', 'byRarity', 'byType'],
    defaultCharts: ['achievementTimeline', 'rarityDistribution'],
    apiEndpoint: '/api/achievements/statistics'
  },
  {
    key: 'map',
    title: 'Life Map',
    description: 'The global graph of your life: eras and turning points.',
    tier: 'lab',
    route: '/discovery/map',
    icon: Map,
    metrics: ['turningPointCount', 'eraCount', 'momentumScore'],
    defaultCharts: ['lifeGraph', 'storyArcSpline'],
    apiEndpoint: '/api/analytics/map'
  },
  {
    key: 'search',
    title: 'Search Analytics',
    description: 'Search behavior and retrieval patterns.',
    tier: 'advanced',
    route: '/discovery/search',
    icon: Search,
    metrics: ['searchCount', 'topicCoverage', 'retrievalQuality'],
    defaultCharts: ['searchTimeline', 'topicDistribution'],
    apiEndpoint: '/api/analytics/search'
  }
];

export function getModuleByKey(key: string): AnalyticsModule | undefined {
  return ANALYTICS_MODULES.find(module => module.key === key);
}

export function getModulesByTier(tier: AnalyticsModuleTier): AnalyticsModule[] {
  return ANALYTICS_MODULES.filter(module => module.tier === tier);
}

export function getAllModules(): AnalyticsModule[] {
  return ANALYTICS_MODULES;
}

