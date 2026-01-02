import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { useIdentityPulse } from '../../hooks/useIdentityPulse';
import { IdentityPulseHeader } from './IdentityPulseHeader';
import { IdentitySnapshot } from './IdentitySnapshot';
import { MotifEvolution } from './MotifEvolution';
import { IdentityStatements } from './IdentityStatements';
import { ReflectiveInsights } from './ReflectiveInsights';
import { LoadingSkeleton } from '../discovery/LoadingSkeleton';
import type { IdentityPulse } from '../../api/identity';

// Mock data for demonstration
const MOCK_IDENTITY_PULSE: IdentityPulse = {
  status: 'exploring',
  stability: 0.75,
  driftScore: 0.35,
  moodVolatility: 0.45,
  timeRange: 30,
  totalMemories: 47,
  snapshot: [
    { label: 'Builder', confidence: 0.85, trend: 'up' },
    { label: 'Learner', confidence: 0.78, trend: 'up' },
    { label: 'Discipline-focused', confidence: 0.72, trend: 'stable' },
    { label: 'Exploratory', confidence: 0.68, trend: 'up' },
    { label: 'Career-oriented', confidence: 0.65, trend: 'stable' },
    { label: 'Creative', confidence: 0.62, trend: 'up' },
    { label: 'Reflective', confidence: 0.58, trend: 'stable' },
    { label: 'Problem-solver', confidence: 0.55, trend: 'up' },
    { label: 'Growth-minded', confidence: 0.52, trend: 'up' },
    { label: 'Independent', confidence: 0.48, trend: 'stable' },
    { label: 'Collaborative', confidence: 0.45, trend: 'down' },
    { label: 'Risk-taker', confidence: 0.42, trend: 'up' },
  ],
  timeline: [
    { date: '2024-W1', themes: [{ name: 'discipline', strength: 0.6 }, { name: 'learning', strength: 0.5 }] },
    { date: '2024-W2', themes: [{ name: 'discipline', strength: 0.7 }, { name: 'building', strength: 0.4 }] },
    { date: '2024-W3', themes: [{ name: 'building', strength: 0.8 }, { name: 'discipline', strength: 0.6 }] },
    { date: '2024-W4', themes: [{ name: 'building', strength: 0.85 }, { name: 'learning', strength: 0.7 }] },
    { date: '2024-W5', themes: [{ name: 'exploration', strength: 0.6 }, { name: 'building', strength: 0.75 }] },
    { date: '2024-W6', themes: [{ name: 'career', strength: 0.7 }, { name: 'building', strength: 0.8 }] },
    { date: '2024-W7', themes: [{ name: 'learning', strength: 0.75 }, { name: 'career', strength: 0.65 }] },
    { date: '2024-W8', themes: [{ name: 'building', strength: 0.9 }, { name: 'discipline', strength: 0.7 }] },
  ],
  motifEvolution: [
    {
      name: 'Discipline',
      sparkline: [0.6, 0.7, 0.6, 0.65, 0.7, 0.68, 0.72, 0.7],
      peakMarkers: [
        { date: '2024-W2', intensity: 0.7 },
        { date: '2024-W8', intensity: 0.7 },
      ],
    },
    {
      name: 'Self-doubt',
      sparkline: [0.4, 0.3, 0.25, 0.2, 0.15, 0.18, 0.15, 0.12],
      peakMarkers: [
        { date: '2024-W1', intensity: 0.4 },
      ],
    },
    {
      name: 'Mastery',
      sparkline: [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65],
      peakMarkers: [
        { date: '2024-W8', intensity: 0.65 },
      ],
    },
    {
      name: 'Creativity',
      sparkline: [0.5, 0.55, 0.6, 0.65, 0.7, 0.68, 0.72, 0.75],
      peakMarkers: [
        { date: '2024-W8', intensity: 0.75 },
      ],
    },
  ],
  identityStatements: [
    {
      text: 'someone who builds systems and creates solutions',
      confidence: 0.9,
      date: '2024-01-15T10:00:00Z',
      timeSpan: 'Recent period',
    },
    {
      text: 'a learner who enjoys exploring new technologies',
      confidence: 0.85,
      date: '2024-01-20T14:30:00Z',
      timeSpan: 'Recent period',
    },
    {
      text: 'focused on discipline and consistency in my work',
      confidence: 0.8,
      date: '2024-01-10T09:00:00Z',
      timeSpan: 'Recent period',
    },
    {
      text: 'career-oriented and driven to grow professionally',
      confidence: 0.75,
      date: '2024-01-25T16:00:00Z',
      timeSpan: 'Very recent',
    },
  ],
  insights: [
    {
      text: 'Your professional identity has strengthened steadily.',
      category: 'professional_identity',
      score: 0.8,
      question: 'Does this feel accurate?',
    },
    {
      text: "You've shown less self-doubt during recent learning phases.",
      category: 'confidence',
      score: 0.7,
      question: 'What do you notice about this?',
    },
    {
      text: 'Multiple identities are coexisting right now — exploration phase.',
      category: 'identity_exploration',
      score: 0.35,
      question: 'How does this exploration feel?',
    },
  ],
  summary: "You're actively exploring different aspects of yourself. 4 identity statements captured.",
};

export const IdentityPulsePanel = () => {
  const [timeRange, setTimeRange] = useState<string>('30');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedMotif, setSelectedMotif] = useState<string | null>(null);
  const { pulse, loading, refresh } = useIdentityPulse(timeRange);
  const { pulse: pastPulse } = useIdentityPulse('180'); // For compare mode

  // Use mock data if no real data available
  const displayPulse = pulse || MOCK_IDENTITY_PULSE;
  const displayPastPulse = compareMode ? (pastPulse || MOCK_IDENTITY_PULSE) : null;
  const isMockData = !pulse;

  if (loading && !pulse) {
    return <LoadingSkeleton />;
  }

  return (
    <Card className="neon-surface border border-primary/30">
      <CardHeader>
        <IdentityPulseHeader
          status={displayPulse.status}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
        />
        {isMockData && (
          <div className="mt-2 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1">
            📊 Showing mock data for demonstration. Real data will appear as you journal.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 1. Identity Snapshot - Most Important */}
        <div>
          {compareMode && displayPastPulse ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-white/50 mb-3 font-medium">Now</div>
                <IdentitySnapshot 
                  snapshot={displayPulse.snapshot} 
                  compareData={{
                    pastSnapshot: displayPastPulse.snapshot,
                    showDifferences: true
                  }}
                />
              </div>
              <div>
                <div className="text-xs text-white/50 mb-3 font-medium">6 Months Ago</div>
                <IdentitySnapshot snapshot={displayPastPulse.snapshot} />
              </div>
            </div>
          ) : (
            <IdentitySnapshot snapshot={displayPulse.snapshot} />
          )}
        </div>

        {/* 2. Identity Statements - High Value */}
        <IdentityStatements 
          statements={displayPulse.identityStatements}
        />

        {/* 3. Reflective Insights - High Value */}
        <ReflectiveInsights insights={displayPulse.insights} />

        {/* 4. Key Patterns (Simplified Motif Evolution) */}
        <MotifEvolution 
          motifs={displayPulse.motifEvolution}
          selectedMotif={selectedMotif}
          onMotifClick={(motifName) => {
            setSelectedMotif(selectedMotif === motifName ? null : motifName);
          }}
        />
      </CardContent>
    </Card>
  );
};
