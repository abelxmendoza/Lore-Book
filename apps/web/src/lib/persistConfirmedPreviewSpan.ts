import type { LexicalPreviewSpan } from '../api/lexicalPreview';

import { confirmComposerEntity, type ConfirmedComposerEntity } from './confirmComposerEntity';
import { colorKeyForPreviewType } from './entityColorMap';
import type { CorrectedPreviewSpan } from './entityCorrectionTypes';

/**
 * Immediately persist a confirmed composer *preview span* (a freshly detected
 * proper noun, not yet a book entity).
 *
 * Preview spans previously only staged locally and relied on send→ingestion to
 * create anything — so confirming a chip looked like it did nothing. Certified
 * book chips already create on confirm via {@link confirmComposerEntity}; this
 * brings preview spans to parity for the common case: people.
 *
 * Scope note: only person spans create immediately here. `confirmComposerEntity`
 * creates characters by name (server-side dedup), whereas its location/organization
 * branches require a real backend candidate id a raw preview span doesn't have.
 * Place/org/group spans are now correctly typed upstream and persist via the
 * send→ingestion path; a bare uncertain proper noun renders as a person chip, so
 * it is treated as a person here to match what the user sees.
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
  const isPerson = colorKey === 'person' || colorKey === 'uncertain';
  if (!isPerson) return null;

  const name = (corrected?.text ?? span.text ?? '').trim();
  if (!name) return null;

  return confirmComposerEntity({
    id: `draft:preview:${span.start}:${span.end}`,
    name,
    type: 'character',
    aliases: [],
    mentionKeys: [],
    status: 'draft',
    matchedLabel: name,
  });
}
