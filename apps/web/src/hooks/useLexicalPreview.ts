import { useEffect, useRef, useState } from 'react';
import type { LexicalPreviewResponse } from '../api/lexicalPreview';
import { fetchLexicalPreviewShared } from '../lib/lexicalPreviewCache';
import { clientLexicalPreviewSpans } from '../lib/clientLexicalPreview';

export type LexicalPreviewFetchPolicy = {
  /**
   * Incremented on blur/send. Remote history-aware preview must not follow
   * every keystroke — only this generation.
   */
  authorityGeneration?: number;
};

/** Fetch-only lexical preview — corrections live in useEntityCorrectionState. */
export function useLexicalPreview(
  text: string,
  threadId?: string,
  policy: LexicalPreviewFetchPolicy = {},
) {
  const [preview, setPreview] = useState<LexicalPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;
  const threadRef = useRef(threadId);
  threadRef.current = threadId;
  const authorityGeneration = policy.authorityGeneration ?? 0;

  useEffect(() => {
    if (!textRef.current.trim()) {
      setPreview(null);
      setLoading(false);
      return;
    }
  }, [text]);

  useEffect(() => {
    if (authorityGeneration <= 0) return;
    const snapshot = textRef.current;
    const snapshotThread = threadRef.current;
    if (!snapshot.trim()) return;

    const reqId = ++reqRef.current;
    setLoading(true);

    void (async () => {
      try {
        const result = await fetchLexicalPreviewShared(snapshot, snapshotThread);
        if (reqId !== reqRef.current) return;
        setPreview(result);
      } catch {
        if (reqId !== reqRef.current) return;
        setPreview({
          spans: clientLexicalPreviewSpans(snapshot),
          inferredAssociations: [],
          ambiguities: ['preview_offline_fallback'],
        });
      } finally {
        if (reqId === reqRef.current) setLoading(false);
      }
    })();
  }, [authorityGeneration]);

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
