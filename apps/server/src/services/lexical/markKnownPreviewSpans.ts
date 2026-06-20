import { normalizeLexicalText } from './lexicalNormalizer';
import type { LexicalPreviewSpan } from './lexicalPreviewService';
import type { HistoryContext } from '../inference/inferenceAssociationTypes';
import { matchExistingPerson, matchExistingGroup, matchExistingEmployer, matchExistingWorksite } from '../inference/historyAssociationService';

function norm(s: string): string {
  return normalizeLexicalText(s);
}

/** Tag preview spans as known (in LoreBook) vs new (detected but not yet indexed). */
export function markKnownPreviewSpans(
  spans: LexicalPreviewSpan[],
  history: HistoryContext
): LexicalPreviewSpan[] {
  return spans.map((span) => {
    if (span.type === 'PERSON') {
      const person = matchExistingPerson(history, span.text);
      if (person) {
        return {
          ...span,
          entityStatus: 'known' as const,
          matchedEntityId: person.id,
          matchedEntityName: person.name,
        };
      }
    }

    if (span.type === 'PLACE') {
      const key = norm(span.text);
      const place = history.places.get(key);
      if (place) {
        return {
          ...span,
          entityStatus: 'known' as const,
          matchedEntityId: place.id,
          matchedEntityName: place.name,
        };
      }
    }

    if (span.type === 'GROUP') {
      const group = matchExistingGroup(history, span.text);
      if (group) {
        return {
          ...span,
          entityStatus: 'known' as const,
          matchedEntityId: group.id,
          matchedEntityName: group.name,
        };
      }
    }

    if (span.type === 'ORGANIZATION' || span.subtype === 'EMPLOYER') {
      const employer = matchExistingEmployer(history, span.text);
      if (employer) {
        return {
          ...span,
          entityStatus: 'known' as const,
          matchedEntityId: employer.id,
          matchedEntityName: employer.name,
        };
      }
    }

    if (span.type === 'DEPLOYMENT_SITE' || span.subtype === 'WORKSITE') {
      const site = matchExistingWorksite(history, span.text);
      if (site) {
        return {
          ...span,
          entityStatus: 'known' as const,
          matchedEntityId: site.id,
          matchedEntityName: site.name,
        };
      }
    }

    if (span.type === 'SKILL' || span.type === 'TASK' || span.type === 'WORK_ACTIVITY') {
      const key = norm(span.text);
      if (history.skills.has(key)) {
        return { ...span, entityStatus: 'known' as const };
      }
    }

    if (span.type === 'INTEREST' || span.subtype === 'MUSIC_GENRE') {
      const key = norm(span.text.replace(/\s+shows?$/i, ''));
      if (history.skills.has(key) || history.hobbies.has(key)) {
        return { ...span, entityStatus: 'known' as const };
      }
    }

    return { ...span, entityStatus: 'new' as const };
  });
}
