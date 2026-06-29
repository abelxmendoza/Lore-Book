import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntityType } from '../types/certifiedEntity';

import { confirmComposerEntity, type ConfirmedComposerEntity } from './confirmComposerEntity';
import { colorKeyForPreviewType } from './entityColorMap';
import type { CorrectedPreviewSpan } from './entityCorrectionTypes';

// Composer chip color → the book a confirmed preview span lands in. Each target
// has a name-based create path in `confirmComposerEntity`. A bare uncertain proper
// noun renders as a person chip, so it is treated as a person to match what the
// user sees. Kinds without a name-based create here (skill/project/event/thing)
// fall through to the send→ingestion path.
const PREVIEW_COLOR_TO_ENTITY_TYPE: Record<string, CertifiedEntityType> = {
  person: 'character',
  uncertain: 'character',
  place: 'location',
  organization: 'organization',
  group: 'organization',
};

/**
 * Immediately persist a confirmed composer *preview span* (a freshly detected
 * proper noun, not yet a book entity).
 *
 * Preview spans previously only staged locally and relied on send→ingestion to
 * create anything — so confirming a chip looked like it did nothing. This brings
 * them to parity with certified book chips, which create on confirm via
 * {@link confirmComposerEntity}, for people, places, and organizations/groups.
 */
export async function persistConfirmedPreviewSpan(
  span: LexicalPreviewSpan,
  corrected?: CorrectedPreviewSpan,
): Promise<ConfirmedComposerEntity | null> {
  // A user type-correction must win over the span's original (often "uncertain")
  // colorKey, so derive the color purely from the corrected type when present.
  const correctedType = corrected?.correctedType;
  const type = correctedType ?? span.type;
  const colorKeyHint = corrected?.colorKey ?? (correctedType ? undefined : span.colorKey);
  const colorKey = colorKeyForPreviewType(type, colorKeyHint);
  const entityType = PREVIEW_COLOR_TO_ENTITY_TYPE[colorKey];
  if (!entityType) return null;

  const name = (corrected?.text ?? span.text ?? '').trim();
  if (!name) return null;

  return confirmComposerEntity({
    id: `draft:preview:${span.start}:${span.end}`,
    name,
    type: entityType,
    aliases: [],
    mentionKeys: [],
    status: 'draft',
    matchedLabel: name,
  });
}
