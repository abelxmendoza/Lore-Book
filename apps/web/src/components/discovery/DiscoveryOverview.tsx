import { useState, useEffect, useCallback } from 'react';
import { 
  Brain, 
  Users, 
  BookOpen, 
  Network, 
  Sparkles, 
  Zap, 
  Heart, 
  AlertCircle,
  Compass,
  X,
  TrendingUp,
  Map,
  Search,
  Activity
} from 'lucide-react';
import { IdentityPulsePanel } from '../identity/IdentityPulsePanel';
import { CharactersAnalyticsPanel } from './CharactersAnalyticsPanel';
import { RelationshipsAnalyticsPanel } from './RelationshipsAnalyticsPanel';
import { SagaScreen } from '../saga/SagaScreen';
import { MemoryFabricPanel } from '../fabric/MemoryFabricPanel';
import { InsightsPanel, type InsightPayload } from '../InsightsPanel';
import { MonthlyYearlyInsights } from '../insights/MonthlyYearlyInsights';
import { PredictionsAnalyticsPanel } from './PredictionsAnalyticsPanel';
import { SearchAnalyticsPanel } from './SearchAnalyticsPanel';
import { ShadowAnalyticsPanel } from './ShadowAnalyticsPanel';
import { XpAnalyticsPanel } from './XpAnalyticsPanel';
import { LifeMapPanel } from './LifeMapPanel';
import { AutopilotPanel } from '../AutopilotPanel';
import { SoulProfilePanel } from './SoulProfilePanel';
import { TruthSeekerPanel } from './TruthSeekerPanel';
import { ContinuityDashboard } from '../continuity/ContinuityDashboard';
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

const PANEL_CONFIGS: PanelConfig[] = [
  // Core Analytics Panels
  {
    id: 'continuity',
    title: 'Continuity Intelligence',
    description: 'The Jarvis of your life. Detects contradictions, emotional arcs, identity drift, and repeating loops.',
    icon: Activity,
    component: ContinuityDashboard
  },
  {
    id: 'identity',
    title: 'Identity Pulse',
    description: 'Your persona signature and emotional trajectory.',
    icon: Brain,
    component: IdentityPulsePanel
  },
  {
    id: 'relationships',
    title: 'Relationships',
    description: 'See who shapes your emotional landscape.',
    icon: Users,
    component: RelationshipsAnalyticsPanel
  },
  {
    id: 'characters',
    title: 'Characters',
    description: 'Character mention patterns, sentiment trends, and interaction analytics.',
    icon: Users,
    component: CharactersAnalyticsPanel
  },
  {
    id: 'saga',
    title: 'Sagas',
    description: 'Your life\'s arcs, eras, and narrative beats.',
    icon: BookOpen,
    component: SagaScreen
  },
  {
    id: 'memory-fabric',
    title: 'Memory Fabric',
    description: 'Clusters, bridges, and outliers in your memories.',
    icon: Network,
    component: MemoryFabricPanel
  },
  {
    id: 'insights',
    title: 'Insights',
    description: 'Correlations, loops, and recurring patterns.',
    icon: Sparkles,
    component: InsightsPanelWrapper
  },
  {
    id: 'time-insights',
    title: 'Time-based Insights',
    description: 'Monthly and yearly insights across different time periods.',
    icon: Calendar,
    component: MonthlyYearlyInsights
  },
  {
    id: 'predictions',
    title: 'Predictions',
    description: 'Forecast where your story is heading.',
    icon: TrendingUp,
    component: PredictionsAnalyticsPanel
  },
  {
    id: 'search',
    title: 'Search Analytics',
    description: 'Search behavior and retrieval patterns.',
    icon: Search,
    component: SearchAnalyticsPanel
  },
  {
    id: 'shadow',
    title: 'Shadow',
    description: 'Suppressed topics, negative loops, and inner archetypes.',
    icon: AlertCircle,
    component: ShadowAnalyticsPanel
  },
  {
    id: 'xp',
    title: 'XP Dashboard',
    description: 'Your life XP, levels, and streaks.',
    icon: Zap,
    component: XpAnalyticsPanel
  },
  {
    id: 'map',
    title: 'Life Map',
    description: 'The global graph of your life: eras and turning points.',
    icon: Map,
    component: LifeMapPanel
  },
  // Additional panels (kept for now)
  {
    id: 'autopilot',
    title: 'Autopilot',
    description: 'AI life guidance and recommendations.',
    icon: Zap,
    component: AutopilotPanel
  },
  {
    id: 'soul-profile',
    title: 'Soul Profile',
    description: 'Your essence, hopes, dreams, fears, strengths, and skills.',
    icon: Heart,
    component: SoulProfilePanel
  },
  {
    id: 'truth-seeker',
    title: 'Truth Seeker',
    description: 'Fact checking and contradiction detection.',
    icon: AlertCircle,
    component: TruthSeekerPanel
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
