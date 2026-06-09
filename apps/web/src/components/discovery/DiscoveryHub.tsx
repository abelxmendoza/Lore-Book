import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DiscoveryLayout } from './DiscoveryLayout';
import { DiscoveryOverview } from './DiscoveryOverview';
import { LoadingSkeleton } from './LoadingSkeleton';
import { PanelBoundary } from './PanelBoundary';
import { PanelBreadcrumb } from './PanelBreadcrumb';

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
const InsightsAndPredictionsPanel = lazy(() =>
  import('./InsightsAndPredictionsPanel').then(m => ({ default: m.InsightsAndPredictionsPanel }))
);
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

// Wraps every panel route: isolated error boundary + breadcrumb nav
const Panel = ({ children }: { children: ReactNode }) => (
  <PanelBoundary>
    <PanelBreadcrumb />
    {children}
  </PanelBoundary>
);

export const DiscoveryHub = () => (
  <DiscoveryLayout>
    <Suspense fallback={<PanelFallback />}>
      <Routes>
        {/* Overview — the intelligence dashboard */}
        <Route index element={<DiscoveryOverview />} />

        {/* Insights panels */}
        <Route path="soul-profile"         element={<Panel><SoulProfilePanel /></Panel>} />
        <Route path="identity"             element={<Panel><IdentityPulsePanel /></Panel>} />
        <Route path="relationships"        element={<Panel><RelationshipsAnalyticsPanel /></Panel>} />
        <Route path="insights-predictions" element={<Panel><InsightsAndPredictionsPanel /></Panel>} />
        <Route path="values-habits"        element={<Panel><ValuesAndHabitsPanel /></Panel>} />
        <Route path="decisions"            element={<Panel><DecisionMemoryPanel /></Panel>} />
        <Route path="life-arc"             element={<Panel><LifeArcPanel /></Panel>} />
        <Route path="shadow"               element={<Panel><ShadowAnalyticsPanel /></Panel>} />
        <Route path="xp"                   element={<Panel><XpAnalyticsPanel /></Panel>} />
        <Route path="reactions-resilience" element={<Panel><ReactionsResiliencePanel /></Panel>} />

        {/* Data & Control panels */}
        <Route path="memory-management"    element={<Panel><MemoryManagementPanel /></Panel>} />
        <Route path="memory-review"        element={<Panel><MemoryReviewQueuePanel /></Panel>} />
        <Route path="continuity"           element={<Panel><ContinuityDashboard /></Panel>} />
        <Route path="correction-dashboard" element={<Panel><CorrectionDashboard /></Panel>} />
        <Route path="entity-resolution"    element={<Panel><EntityResolutionDashboard /></Panel>} />
        <Route path="memory-fade"          element={<Panel><MemoryFadePanel /></Panel>} />
      </Routes>
    </Suspense>
  </DiscoveryLayout>
);
