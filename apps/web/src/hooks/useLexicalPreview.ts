import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLexicalPreview, type LexicalPreviewResponse } from '../api/lexicalPreview';
import { clientLexicalPreviewSpans } from '../lib/clientLexicalPreview';

const DEBOUNCE_MS = 280;

/** Fetch-only lexical preview — corrections live in useEntityCorrectionState. */
export function useLexicalPreview(text: string, threadId?: string) {
  const [preview, setPreview] = useState<LexicalPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      setLoading(false);
      return;
    }

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const reqId = ++reqRef.current;
      setLoading(true);

      void (async () => {
        try {
          const result = await fetchLexicalPreview(text, threadId);
          if (reqId !== reqRef.current) return;
          setPreview(result);
        } catch {
          if (reqId !== reqRef.current) return;
          setPreview({
            spans: clientLexicalPreviewSpans(text),
            inferredAssociations: [],
            ambiguities: ['preview_offline_fallback'],
          });
        } finally {
          if (reqId === reqRef.current) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [text, threadId]);

  return {
    preview,
    loading,
    spans: preview?.spans ?? [],
    inferredAssociations: preview?.inferredAssociations ?? [],
    ambiguities: preview?.ambiguities ?? [],
    isTemporary: true,
  };
}

/** @deprecated use spanToId from correctedPreviewSpanReducer */
export function spanId(span: { start: number; end: number; type: string }): string {
  return `${span.start}:${span.end}:${span.type}`;
}
