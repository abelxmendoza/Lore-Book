import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DiscoveryLayout } from './DiscoveryLayout';
import { DiscoveryOverview } from './DiscoveryOverview';
import { LoadingSkeleton } from './LoadingSkeleton';

// Each panel is lazy-loaded — zero cost until its route is active.
const SoulProfilePanel = lazy(() =>
  import('./SoulProfilePanel').then(m => ({ default: m.SoulProfilePanel }))
);
const IdentityPulsePanel = lazy(() =>
  import('../identity/IdentityPulsePanel').then(m => ({ default: m.IdentityPulsePanel }))
);
const RelationshipsAnalyticsPanel = lazy(() =>
  import('./RelationshipsAnalyticsPanel').then(m => ({ default: m.RelationshipsAnalyticsPanel }))
);
// Phase 4: Insights + Predictions merged into one panel
const InsightsAndPredictionsPanel = lazy(() =>
  import('./InsightsAndPredictionsPanel').then(m => ({ default: m.InsightsAndPredictionsPanel }))
);
// Phase 4: Goals & Values + Habits & Values merged
const ValuesAndHabitsPanel = lazy(() =>
  import('./ValuesAndHabitsPanel').then(m => ({ default: m.ValuesAndHabitsPanel }))
);
const DecisionMemoryPanel = lazy(() =>
  import('./DecisionMemoryPanel').then(m => ({ default: m.DecisionMemoryPanel }))
);
const LifeArcPanel = lazy(() =>
  import('./LifeArcPanel').then(m => ({ default: m.LifeArcPanel }))
);
const ShadowAnalyticsPanel = lazy(() =>
  import('./ShadowAnalyticsPanel').then(m => ({ default: m.ShadowAnalyticsPanel }))
);
const XpAnalyticsPanel = lazy(() =>
  import('./XpAnalyticsPanel').then(m => ({ default: m.XpAnalyticsPanel }))
);
const ReactionsResiliencePanel = lazy(() =>
  import('./ReactionsResiliencePanel').then(m => ({ default: m.ReactionsResiliencePanel }))
);
const MemoryManagementPanel = lazy(() =>
  import('./MemoryManagementPanel').then(m => ({ default: m.MemoryManagementPanel }))
);
const MemoryReviewQueuePanel = lazy(() =>
  import('./MemoryReviewQueuePanel').then(m => ({ default: m.MemoryReviewQueuePanel }))
);
const ContinuityDashboard = lazy(() =>
  import('../continuity/ContinuityDashboard').then(m => ({ default: m.ContinuityDashboard }))
);
const CorrectionDashboard = lazy(() =>
  import('../correction-dashboard/CorrectionDashboard').then(m => ({ default: m.CorrectionDashboard }))
);
const EntityResolutionDashboard = lazy(() =>
  import('../entity-resolution/EntityResolutionDashboard').then(m => ({ default: m.EntityResolutionDashboard }))
);
const MemoryFadePanel = lazy(() =>
  import('./MemoryFadePanel').then(m => ({ default: m.MemoryFadePanel }))
);

const PanelFallback = () => (
  <div className="pt-2">
    <LoadingSkeleton />
  </div>
);

export const DiscoveryHub = () => (
  <DiscoveryLayout>
    <Suspense fallback={<PanelFallback />}>
      <Routes>
        {/* Overview — the intelligence dashboard */}
        <Route index element={<DiscoveryOverview />} />

        {/* Insights panels */}
        <Route path="soul-profile" element={<SoulProfilePanel />} />
        <Route path="identity" element={<IdentityPulsePanel />} />
        <Route path="relationships" element={<RelationshipsAnalyticsPanel />} />
        <Route path="insights-predictions" element={<InsightsAndPredictionsPanel />} />
        <Route path="values-habits" element={<ValuesAndHabitsPanel />} />
        <Route path="decisions" element={<DecisionMemoryPanel />} />
        <Route path="life-arc" element={<LifeArcPanel />} />
        <Route path="shadow" element={<ShadowAnalyticsPanel />} />
        <Route path="xp" element={<XpAnalyticsPanel />} />
        <Route path="reactions-resilience" element={<ReactionsResiliencePanel />} />

        {/* Data & Control panels */}
        <Route path="memory-management" element={<MemoryManagementPanel />} />
        <Route path="memory-review" element={<MemoryReviewQueuePanel />} />
        <Route path="continuity" element={<ContinuityDashboard />} />
        <Route path="correction-dashboard" element={<CorrectionDashboard />} />
        <Route path="entity-resolution" element={<EntityResolutionDashboard />} />
        <Route path="memory-fade" element={<MemoryFadePanel />} />
      </Routes>
    </Suspense>
  </DiscoveryLayout>
);
