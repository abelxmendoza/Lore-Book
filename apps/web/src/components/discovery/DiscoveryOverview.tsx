import { useState, useEffect, useCallback } from 'react';
import { 
  Brain, 
  Sparkles, 
  Zap, 
  Heart, 
  Compass,
  X,
  Award,
  Users,
  Activity,
  AlertCircle,
  ClipboardCheck,
  Clock,
  TrendingUp,
  Target,
  Database,
  HeartPulse
} from 'lucide-react';
import { IdentityPulsePanel } from '../identity/IdentityPulsePanel';
import { InsightsPanel, type InsightPayload } from '../InsightsPanel';
import { XpAnalyticsPanel } from './XpAnalyticsPanel';
import { SoulProfilePanel } from './SoulProfilePanel';
import { AchievementsPanel } from './AchievementsPanel';
import { RelationshipsAnalyticsPanel } from './RelationshipsAnalyticsPanel';
import { ContinuityDashboard } from '../continuity/ContinuityDashboard';
import { ShadowAnalyticsPanel } from './ShadowAnalyticsPanel';
import { MemoryReviewQueuePanel } from './MemoryReviewQueuePanel';
import { DecisionMemoryPanel } from './DecisionMemoryPanel';
import { InsightsAndPredictionsPanel } from './InsightsAndPredictionsPanel';
import { GoalsAndValuesPanel } from './GoalsAndValuesPanel';
import { MemoryManagementPanel } from './MemoryManagementPanel';
import { ReactionsResiliencePanel } from './ReactionsResiliencePanel';
import { LifeArcPanel } from './LifeArcPanel';
import { CorrectionDashboard } from '../correction-dashboard/CorrectionDashboard';
import { EntityResolutionDashboard } from '../entity-resolution/EntityResolutionDashboard';
import { fetchJson } from '../../lib/api';

// Wrapper component for InsightsPanel that fetches data
const InsightsPanelWrapper = () => {
  const [insights, setInsights] = useState<InsightPayload | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchJson<{ insights?: InsightPayload }>('/api/insights/recent');
      setInsights(result.insights || result);
    } catch (error) {
      console.error('Failed to load insights:', error);
      setInsights(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  return <InsightsPanel insights={insights} loading={loading} onRefresh={loadInsights} />;
};

interface PanelConfig {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType;
}

// Core analytics panels that answer human questions
// Each panel provides unique insights not available elsewhere
const PANEL_CONFIGS: PanelConfig[] = [
  {
    id: 'memory-management',
    title: 'Memory Management',
    description: 'Better than ChatGPT\'s memory: time-aware, evidence-based, with confidence scores. View, edit, and manage all memories.',
    icon: Database,
    component: MemoryManagementPanel
  },
  {
    id: 'memory-review',
    title: 'Memory Review Queue',
    description: 'Review and control what memories are being proposed. The trust choke point for all memory ingestion.',
    icon: ClipboardCheck,
    component: MemoryReviewQueuePanel
  },
  {
    id: 'decisions',
    title: 'Decision Memory',
    description: 'Snapshots of decisions you\'ve made, preserving context, options, and reasoning from that moment.',
    icon: Clock,
    component: DecisionMemoryPanel
  },
  {
    id: 'insights-predictions',
    title: 'Insights & Predictions',
    description: 'Observations and probabilistic projections. These are not facts and never write to memory.',
    icon: TrendingUp,
    component: InsightsAndPredictionsPanel
  },
  {
    id: 'goals-values',
    title: 'Goals & Values',
    description: 'Your declared values and goals anchor the system. Alignment is observational, drift is surfaced neutrally.',
    icon: Target,
    component: GoalsAndValuesPanel
  },
  {
    id: 'identity',
    title: 'Identity Pulse',
    description: 'How am I changing right now? Short-term identity shifts, drift, and emotional trajectory.',
    icon: Brain,
    component: IdentityPulsePanel
  },
  {
    id: 'soul-profile',
    title: 'Soul Profile',
    description: 'Who am I underneath the day-to-day noise? Your essence, hopes, dreams, fears, strengths, and skills.',
    icon: Heart,
    component: SoulProfilePanel
  },
  {
    id: 'relationships',
    title: 'Relationships',
    description: 'Who shapes my emotional landscape? Relationship network, sentiment patterns, and attachment dynamics.',
    icon: Users,
    component: RelationshipsAnalyticsPanel
  },
  {
    id: 'continuity',
    title: 'Continuity Intelligence',
    description: 'Are there contradictions in my story? Detects conflicts, emotional arcs, identity drift, and repeating loops.',
    icon: Activity,
    component: ContinuityDashboard
  },
  {
    id: 'shadow',
    title: 'Shadow',
    description: 'What am I suppressing? Suppressed topics, negative loops, and inner archetypes.',
    icon: AlertCircle,
    component: ShadowAnalyticsPanel
  },
  {
    id: 'insights',
    title: 'Insights',
    description: 'What patterns do I repeat? Correlations, loops, and recurring patterns.',
    icon: Sparkles,
    component: InsightsPanelWrapper
  },
  {
    id: 'xp',
    title: 'Skills & Progress',
    description: 'How am I progressing in my skills? Your life XP, levels, streaks, and skill development.',
    icon: Zap,
    component: XpAnalyticsPanel
  },
  {
    id: 'achievements',
    title: 'Achievements',
    description: 'Unlocked milestones and accomplishments in your journey.',
    icon: Award,
    component: AchievementsPanel
  },
  {
    id: 'reactions-resilience',
    title: 'Reactions & Resilience',
    description: 'Patterns in how you respond to experiences and beliefs. Recovery, resilience, and therapeutic reflection.',
    icon: HeartPulse,
    component: ReactionsResiliencePanel
  },
  {
    id: 'life-arc',
    title: 'Recent Moments',
    description: 'A narrative, human-understandable view of what\'s been going on in your life lately, using events as the atomic units.',
    icon: Compass,
    component: LifeArcPanel
  },
  {
    id: 'correction-dashboard',
    title: 'Correction & Pruning',
    description: 'View and manage corrections, deprecated knowledge, and contradictions. Everything is transparent, reversible, and traceable.',
    icon: AlertCircle,
    component: CorrectionDashboard
  },
  {
    id: 'entity-resolution',
    title: 'Entity Resolution',
    description: 'Give explicit control over people, places, orgs, and concepts the system has inferred. No silent merges or splits.',
    icon: Users,
    component: EntityResolutionDashboard
  }
];

export const DiscoveryOverview = () => {
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const handlePanelClick = (panelId: string) => {
    setOpenPanel(openPanel === panelId ? null : panelId);
  };

  const openPanelConfig = openPanel ? PANEL_CONFIGS.find(p => p.id === openPanel) : null;
  const PanelComponent = openPanelConfig?.component;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Analytical Panels</h1>
        <p className="text-white/60">Toggle panels to explore different aspects of your data.</p>
      </div>

      {/* Panel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PANEL_CONFIGS.map((panel) => {
          const Icon = panel.icon;
          const isOpen = openPanel === panel.id;
          
          return (
            <button
              key={panel.id}
              onClick={() => handlePanelClick(panel.id)}
              className={`text-left p-6 rounded-lg border transition-all ${
                isOpen
                  ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                  : 'border-border/60 bg-black/40 hover:border-primary/50 hover:bg-primary/5'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${
                  isOpen ? 'bg-primary/20' : 'bg-primary/10'
                }`}>
                  <Icon className={`h-6 w-6 ${
                    isOpen ? 'text-primary' : 'text-primary/70'
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{panel.title}</h3>
                  <p className="text-sm text-white/60">{panel.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Open Panel Content */}
      {openPanel && PanelComponent && (
        <div className="mt-6 border border-border/60 rounded-lg bg-black/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-white">{openPanelConfig.title}</h2>
            <button
              onClick={() => setOpenPanel(null)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close panel"
            >
              <X className="h-5 w-5 text-white/70" />
            </button>
          </div>
          <PanelComponent />
        </div>
      )}

      {/* No Panels Open Message */}
      {!openPanel && (
        <div className="text-center py-12 border border-border/60 rounded-lg bg-black/20">
          <Compass className="h-12 w-12 mx-auto mb-4 text-white/40" />
          <p className="text-white/60 mb-2">No Panels Open</p>
          <p className="text-sm text-white/40">Select a panel above to start exploring your data.</p>
        </div>
      )}
    </div>
  );
};
