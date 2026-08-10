import type {
  CognitiveChangeType,
  ProjectionImpact,
  ProjectionKind,
  ProjectionUpdateAction,
  UpdatePriority,
} from './cognitiveUpdateTypes';

type ProjectionPolicy = {
  dependsOn: ProjectionKind[];
  defaultAction: ProjectionUpdateAction;
  priority: UpdatePriority;
};

export const PROJECTION_DEPENDENCIES: Record<ProjectionKind, ProjectionPolicy> = {
  assertions: { dependsOn: [], defaultAction: 'NO_ACTION', priority: 'HIGH' },
  canonical_timeline: {
    dependsOn: ['assertions'],
    defaultAction: 'INCREMENTAL_REFRESH',
    priority: 'HIGH',
  },
  relationship_projection: {
    dependsOn: ['assertions', 'canonical_timeline'],
    defaultAction: 'REVIEW_REQUIRED',
    priority: 'HIGH',
  },
  goal_projection: {
    dependsOn: ['assertions'],
    defaultAction: 'REVIEW_REQUIRED',
    priority: 'HIGH',
  },
  quest_projection: {
    dependsOn: ['goal_projection'],
    defaultAction: 'REVIEW_REQUIRED',
    priority: 'MEDIUM',
  },
  project_projection: {
    dependsOn: ['assertions', 'canonical_timeline'],
    defaultAction: 'REVIEW_REQUIRED',
    priority: 'MEDIUM',
  },
  narrative_ir: {
    dependsOn: ['canonical_timeline', 'relationship_projection', 'goal_projection', 'project_projection'],
    defaultAction: 'MARK_STALE',
    priority: 'MEDIUM',
  },
  identity_snapshot: {
    dependsOn: ['narrative_ir'],
    defaultAction: 'MARK_STALE',
    priority: 'LOW',
  },
  context_plan_cache: {
    dependsOn: ['identity_snapshot', 'narrative_ir'],
    defaultAction: 'MARK_STALE',
    priority: 'LOW',
  },
};

const CHANGE_SEEDS: Record<CognitiveChangeType, ProjectionKind[]> = {
  IDENTITY_STRENGTHENED: ['identity_snapshot'],
  IDENTITY_WEAKENED: ['identity_snapshot'],
  RELATIONSHIP_CHANGED: ['relationship_projection', 'narrative_ir'],
  GOAL_COMPLETED: ['goal_projection', 'quest_projection', 'narrative_ir'],
  GOAL_ABANDONED: ['goal_projection', 'quest_projection', 'narrative_ir'],
  GOAL_REPRIORITIZED: ['goal_projection', 'quest_projection'],
  PROJECT_STARTED: ['project_projection', 'canonical_timeline', 'narrative_ir'],
  PROJECT_COMPLETED: ['project_projection', 'canonical_timeline', 'narrative_ir'],
  PROJECT_STATUS_CHANGED: ['project_projection', 'narrative_ir', 'identity_snapshot'],
  CURRENT_FOCUS_CHANGED: ['identity_snapshot', 'context_plan_cache'],
  LIFE_EVENT_DETECTED: ['canonical_timeline', 'narrative_ir'],
  CAREER_MILESTONE: ['canonical_timeline', 'narrative_ir', 'identity_snapshot'],
  CHAPTER_STARTED: ['narrative_ir', 'identity_snapshot'],
  CHAPTER_ENDED: ['narrative_ir', 'identity_snapshot'],
  RECURRING_PATTERN_CANDIDATE: ['narrative_ir'],
  TIMELINE_CORRECTION: ['canonical_timeline', 'narrative_ir'],
  CONTRADICTION_DETECTED: ['assertions', 'narrative_ir'],
};

function priorityRank(priority: UpdatePriority): number {
  return { HIGH: 0, MEDIUM: 1, LOW: 2, DEFERRED: 3, IDLE: 4 }[priority];
}

export function planProjectionImpacts(
  changes: Array<{ type: CognitiveChangeType; summary: string }>,
  options: { batchSize?: number } = {},
): ProjectionImpact[] {
  const causes = new Map<ProjectionKind, Set<CognitiveChangeType>>();
  const reasons = new Map<ProjectionKind, Set<string>>();

  for (const change of changes) {
    for (const projection of CHANGE_SEEDS[change.type]) {
      if (!causes.has(projection)) causes.set(projection, new Set());
      if (!reasons.has(projection)) reasons.set(projection, new Set());
      causes.get(projection)!.add(change.type);
      reasons.get(projection)!.add(change.summary);
    }
  }

  // Downstream invalidation: when a projection changes, dependents become stale.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const [projection, policy] of Object.entries(PROJECTION_DEPENDENCIES) as Array<
      [ProjectionKind, ProjectionPolicy]
    >) {
      if (causes.has(projection)) continue;
      const changedDependency = policy.dependsOn.find((dependency) => causes.has(dependency));
      if (!changedDependency) continue;
      causes.set(projection, new Set(causes.get(changedDependency)));
      reasons.set(projection, new Set([`Dependency ${changedDependency} was affected.`]));
      expanded = true;
    }
  }

  const largeBatch = (options.batchSize ?? 1) >= 100;
  return [...causes.entries()]
    .map(([projection, changeTypes]): ProjectionImpact => {
      const policy = PROJECTION_DEPENDENCIES[projection];
      const deferred = largeBatch && policy.priority !== 'HIGH';
      return {
        projection,
        action: deferred ? 'MARK_STALE' : policy.defaultAction,
        priority: deferred ? 'DEFERRED' : policy.priority,
        reason: [...(reasons.get(projection) ?? [])].join(' '),
        causedBy: [...changeTypes],
        dependsOn: policy.dependsOn,
      };
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}
