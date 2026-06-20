import type { CorrectedPreviewSpan, OntologyAliasCandidate } from './correctionTypes';

export function mapCorrectionsToOntologyAliases(
  corrections: CorrectedPreviewSpan[]
): OntologyAliasCandidate[] {
  const out: OntologyAliasCandidate[] = [];

  for (const c of corrections) {
    if (
      !c.userConfirmed &&
      c.correctionAction !== 'link_existing' &&
      c.correctionAction !== 'link_existing_entity' &&
      c.correctionAction !== 'rename'
    ) {
      continue;
    }

    if (
      (c.correctionAction === 'link_existing' || c.correctionAction === 'link_existing_entity') &&
      c.linkedEntityId
    ) {
      out.push({
        entityId: c.linkedEntityId,
        entityName: c.linkedEntityName ?? c.text,
        alias: c.displayNameOverride ?? c.text,
        entityType: c.correctedType ?? c.originalType,
        confidence: 0.9,
        requiresConfirmation: true,
      });
    }

    if (c.correctionAction === 'rename' && c.displayNameOverride && c.displayNameOverride !== c.text) {
      out.push({
        entityId: c.linkedEntityId,
        entityName: c.linkedEntityName ?? c.displayNameOverride,
        alias: c.text,
        entityType: c.correctedType ?? c.originalType,
        confidence: 0.88,
        requiresConfirmation: true,
      });
    }

    if (c.userConfirmed && c.displayNameOverride) {
      out.push({
        entityId: c.linkedEntityId,
        entityName: c.displayNameOverride,
        alias: c.text,
        entityType: c.correctedType ?? c.originalType,
        confidence: 0.92,
        requiresConfirmation: true,
      });
    }
  }

  return out;
}

export function parentEntityOverrides(
  corrections: CorrectedPreviewSpan[]
): Map<string, { parentName: string; parentType?: string; parentId?: string }> {
  const map = new Map<string, { parentName: string; parentType?: string; parentId?: string }>();
  for (const c of corrections) {
    if (c.parentEntityName) {
      map.set(c.text.toLowerCase(), {
        parentName: c.parentEntityName,
        parentType: c.parentEntityType,
        parentId: c.parentEntityId,
      });
    }
  }
  return map;
}
