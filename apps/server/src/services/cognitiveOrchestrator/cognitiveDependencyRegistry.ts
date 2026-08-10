import type { ProjectionKind, UpdatePriority } from '../cognitiveUpdate';

export type CognitiveProjectionRegistration = {
  projection: ProjectionKind;
  dependsOn: ProjectionKind[];
  priority: UpdatePriority;
  execution: 'IMMEDIATE' | 'LAZY' | 'BACKGROUND';
};

export const COGNITIVE_DEPENDENCY_REGISTRY: Record<
  ProjectionKind,
  CognitiveProjectionRegistration
> = {
  assertions: {
    projection: 'assertions',
    dependsOn: [],
    priority: 'HIGH',
    execution: 'IMMEDIATE',
  },
  canonical_timeline: {
    projection: 'canonical_timeline',
    dependsOn: ['assertions'],
    priority: 'HIGH',
    execution: 'IMMEDIATE',
  },
  relationship_projection: {
    projection: 'relationship_projection',
    dependsOn: ['assertions', 'canonical_timeline'],
    priority: 'HIGH',
    execution: 'IMMEDIATE',
  },
  goal_projection: {
    projection: 'goal_projection',
    dependsOn: ['assertions'],
    priority: 'HIGH',
    execution: 'IMMEDIATE',
  },
  quest_projection: {
    projection: 'quest_projection',
    dependsOn: ['goal_projection'],
    priority: 'MEDIUM',
    execution: 'LAZY',
  },
  project_projection: {
    projection: 'project_projection',
    dependsOn: ['assertions', 'canonical_timeline'],
    priority: 'MEDIUM',
    execution: 'LAZY',
  },
  narrative_ir: {
    projection: 'narrative_ir',
    dependsOn: [
      'canonical_timeline',
      'relationship_projection',
      'goal_projection',
      'project_projection',
    ],
    priority: 'MEDIUM',
    execution: 'LAZY',
  },
  identity_snapshot: {
    projection: 'identity_snapshot',
    dependsOn: ['narrative_ir'],
    priority: 'LOW',
    execution: 'BACKGROUND',
  },
  context_plan_cache: {
    projection: 'context_plan_cache',
    dependsOn: ['identity_snapshot', 'narrative_ir'],
    priority: 'LOW',
    execution: 'BACKGROUND',
  },
};

export function assertAcyclicCognitiveRegistry(
  registry = COGNITIVE_DEPENDENCY_REGISTRY,
): void {
  const visiting = new Set<ProjectionKind>();
  const visited = new Set<ProjectionKind>();

  const visit = (projection: ProjectionKind): void => {
    if (visited.has(projection)) return;
    if (visiting.has(projection)) {
      throw new Error(`Cognitive dependency cycle detected at ${projection}`);
    }
    visiting.add(projection);
    for (const dependency of registry[projection].dependsOn) visit(dependency);
    visiting.delete(projection);
    visited.add(projection);
  };

  for (const projection of Object.keys(registry) as ProjectionKind[]) visit(projection);
}

export function orderCognitiveProjections(projections: ProjectionKind[]): ProjectionKind[] {
  assertAcyclicCognitiveRegistry();
  const requested = new Set(projections);
  const ordered: ProjectionKind[] = [];
  const visited = new Set<ProjectionKind>();

  const visit = (projection: ProjectionKind): void => {
    if (visited.has(projection)) return;
    visited.add(projection);
    for (const dependency of COGNITIVE_DEPENDENCY_REGISTRY[projection].dependsOn) {
      if (requested.has(dependency)) visit(dependency);
    }
    ordered.push(projection);
  };

  for (const projection of projections) visit(projection);
  return ordered;
}
