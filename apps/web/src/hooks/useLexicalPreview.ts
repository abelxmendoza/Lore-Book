import { useCallback, useEffect, useRef, useState } from 'react';
import type { LexicalPreviewResponse } from '../api/lexicalPreview';
import { abortLexicalPreviewShared, fetchLexicalPreviewShared } from '../lib/lexicalPreviewCache';
import { clientLexicalPreviewSpans } from '../lib/clientLexicalPreview';

const DEBOUNCE_MS = 280;

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError')
  );
}

/** Fetch-only lexical preview — corrections live in useEntityCorrectionState. */
export function useLexicalPreview(text: string, threadId?: string) {
  const [preview, setPreview] = useState<LexicalPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!text.trim()) {
      abortLexicalPreviewShared();
      setPreview(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const reqId = ++reqRef.current;
      setLoading(true);

      void (async () => {
        try {
          const result = await fetchLexicalPreviewShared(text, threadId, controller.signal);
          if (reqId !== reqRef.current || controller.signal.aborted) return;
          setPreview(result);
        } catch (err) {
          if (controller.signal.aborted || isAbortError(err) || reqId !== reqRef.current) return;
          setPreview({
            spans: clientLexicalPreviewSpans(text),
            inferredAssociations: [],
            ambiguities: ['preview_offline_fallback'],
          });
        } finally {
          if (reqId === reqRef.current && !controller.signal.aborted) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      controller.abort();
      abortLexicalPreviewShared();
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
