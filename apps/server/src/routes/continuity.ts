import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const canonicalFacts = [
  { subject: 'Alex', attribute: 'birthday', value: '1990-01-01', confidence: 0.93, scope: 'identity', permanent: true },
  { subject: 'Alex', attribute: 'hometown', value: 'Seattle', confidence: 0.98, scope: 'identity', permanent: true },
  { subject: 'Alex', attribute: 'identity_version', value: 'v2', confidence: 0.82, scope: 'identity' }
];

const driftSignals = [
  { subject: 'Alex', attribute: 'identity_version', drift_score: 0.5, segments: ['Season 1', 'Season 2'], notes: 'Shifted from v1 to v2' },
  { subject: 'Alex', attribute: 'relationships', drift_score: 0.3, segments: ['Spring', 'Summer'], notes: 'New partnerships formed' }
];

const conflicts = [
  {
    conflict_type: 'factual',
    description: 'Birthday mismatch between biography sources',
    severity: 'high',
    subjects: ['Alex'],
    attributes: ['birthday'],
    evidence: ['bio-1', 'bio-3']
  },
  {
    conflict_type: 'temporal',
    description: 'Overlapping events detected in schedule',
    severity: 'medium',
    subjects: ['Alex'],
    attributes: ['date'],
    evidence: ['overlap-1', 'overlap-2']
  }
];

const driftSummary = { character: 0.82, identity: 0.7, project: 0.86, location: 0.9 };

const reportMarkdown = `# Canon Summary
- **Alex::birthday** → 1990-01-01 (conf=0.93, scope=identity)
- **Alex::hometown** → Seattle (conf=0.98, scope=identity)

# Conflicts Report
- [FACTUAL] Birthday mismatch between biography sources (severity: high)
- [TEMPORAL] Overlapping events detected in schedule (severity: medium)

# Drift Maps
- Alex::identity_version drift=0.50 segments=[Season 1, Season 2] Shifted from v1 to v2

# Stability Timeline
- Stable vs unstable eras derived from drift signals above.

# Character Consistency Map
- Character consistency inferred from identity drift metrics.

# Identity Continuity Overview
- Identity stability synthesized from canonical facts and drift trends.
`;

const state = { registry: { facts: canonicalFacts }, driftSummary, driftSignals, score: 88, conflicts };

router.get('/state', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.json({ state });
});

router.get('/conflicts', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.json({ conflicts });
});

router.post('/recompute', requireAuth, async (_req: AuthenticatedRequest, res) => {
  // Placeholder recompute hook. In a full build, this would invoke the Python continuity engine.
  res.json({ state, refreshedAt: new Date().toISOString() });
});

router.get('/report', requireAuth, async (_req: AuthenticatedRequest, res) => {
  res.json({ report: reportMarkdown });
});

export const continuityRouter = router;
