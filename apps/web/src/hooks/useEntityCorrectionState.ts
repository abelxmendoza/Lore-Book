import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LexicalPreviewSpan } from '../api/lexicalPreview';
import type { CertifiedEntityMatch } from '../lib/certifiedEntityMatch';
import { enrichPreviewSpansWithKnownStatus } from '../lib/enrichPreviewSpansWithKnownStatus';
import {
  applyCorrectionAction,
  correctionsForSend,
  correctedSpanToLexicalPreview,
  createEmptyCorrectionState,
  mergeBaseSpans,
  spanToId,
  toCorrectedPreviewSpan,
  visibleCorrectedSpans,
  type CorrectionState,
} from '../lib/correctedPreviewSpanReducer';
import type { CorrectedPreviewSpan, EntityCorrectionAction, CorrectionSource } from '../lib/entityCorrectionTypes';
import { useLexicalPreview } from './useLexicalPreview';

export function useEntityCorrectionState(
  text: string,
  threadId: string | undefined,
  certifiedMatches: CertifiedEntityMatch[]
) {
  const { preview, loading, inferredAssociations, ambiguities } = useLexicalPreview(text, threadId);
  const [state, setState] = useState<CorrectionState>(createEmptyCorrectionState);
  const [activeSpanId, setActiveSpanId] = useState<string | null>(null);

  const rawSpans = useMemo(
    () => enrichPreviewSpansWithKnownStatus(preview?.spans ?? [], certifiedMatches),
    [preview?.spans, certifiedMatches]
  );

  useEffect(() => {
    if (!text.trim()) {
      setState(createEmptyCorrectionState());
      setActiveSpanId(null);
      return;
    }
    setState((prev) => mergeBaseSpans(prev, rawSpans));
  }, [text, rawSpans]);

  const applyAction = useCallback((action: EntityCorrectionAction) => {
    setState((prev) => {
      const base = action.spanId ? prev.byId.get(action.spanId) : undefined;
      return applyCorrectionAction(prev, action, base);
    });
    if (action.kind === 'mark_wrong' || action.kind === 'ignore_phrase') {
      setActiveSpanId(null);
    }
  }, []);

  const openSpan = useCallback(
    (span: LexicalPreviewSpan, source: CorrectionSource = 'composer') => {
      const id = spanToId(span);
      setState((prev) => mergeBaseSpans(prev, [span], source));
      setActiveSpanId(id);
    },
    []
  );

  const visibleSpans = useMemo(
    () => visibleCorrectedSpans(state).map(correctedSpanToLexicalPreview),
    [state]
  );

  const correctedRecords = useMemo(() => visibleCorrectedSpans(state), [state]);

  const activeCorrectedSpan = useMemo(
    () => (activeSpanId ? state.byId.get(activeSpanId) ?? null : null),
    [activeSpanId, state]
  );

  const sendPayload = useMemo(() => correctionsForSend(state), [state]);

  const getCorrectedSpan = useCallback(
    (span: LexicalPreviewSpan): CorrectedPreviewSpan => {
      const id = spanToId(span);
      return state.byId.get(id) ?? toCorrectedPreviewSpan(span);
    },
    [state]
  );

  const closeActiveSpan = useCallback(() => setActiveSpanId(null), []);

  return {
    loading,
    preview,
    inferredAssociations,
    ambiguities,
    visibleSpans,
    correctedRecords,
    activeCorrectedSpan,
    activeSpanId,
    openSpan,
    closeActiveSpan,
    applyAction,
    sendPayload,
    getCorrectedSpan,
  };
}
