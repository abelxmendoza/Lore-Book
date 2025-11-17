import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchJson } from '../lib/api';
import { fetchArcSuggestions, type ArcSuggestion } from '../utils/arcDetection';
import { useAutoTagger } from './useAutoTagger';
import { useCharacterIndexer } from './useCharacterIndexer';
import { useMoodEngine } from './useMoodEngine';

type MemoryPreview = {
  id: string;
  title: string;
  date: string;
  summary?: string;
};

export const useNotebookEngine = () => {
  const [text, setText] = useState('');
  const [arcSuggestions, setArcSuggestions] = useState<ArcSuggestion[]>([]);
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreview[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const autoTagger = useAutoTagger();
  const characterIndexer = useCharacterIndexer();
  const moodEngine = useMoodEngine();

  const refreshAnalyses = useCallback(
    (content: string) => {
      autoTagger.refreshSuggestions(content);
      characterIndexer.analyze(content);
      void moodEngine.evaluate(content);
    },
    [autoTagger, characterIndexer, moodEngine]
  );

  useEffect(() => {
    refreshAnalyses(text);
  }, [text, refreshAnalyses]);

  const linkedMetadata = useMemo(
    () => ({
      tags: autoTagger.tags,
      characters: characterIndexer.linkedCharacters,
      mood: moodEngine.mood.score,
      arcId: arcSuggestions[0]?.id ?? null,
      references: memoryPreview.map((preview) => preview.id)
    }),
    [arcSuggestions, autoTagger.tags, characterIndexer.linkedCharacters, memoryPreview, moodEngine.mood.score]
  );

  const runArcDetection = useCallback(
    async (content: string) => {
      const arcs = await fetchArcSuggestions(content);
      setArcSuggestions(arcs);
    },
    []
  );

  const runMemoryPreview = useCallback(
    async (content: string) => {
      if (!content.trim()) {
        setMemoryPreview([]);
        return;
      }
      try {
        const { previews } = await fetchJson<{ previews: MemoryPreview[] }>(`/api/memory-preview`, {
          method: 'POST',
          body: JSON.stringify({ text: content, tags: autoTagger.tags, characters: characterIndexer.linkedCharacters })
        });
        setMemoryPreview(previews ?? []);
      } catch (error) {
        console.warn('Memory preview failed', error);
      }
    },
    [autoTagger.tags, characterIndexer.linkedCharacters]
  );

  useEffect(() => {
    const debounce = setTimeout(() => {
      void runArcDetection(text);
      void runMemoryPreview(text);
    }, 500);
    return () => clearTimeout(debounce);
  }, [runArcDetection, runMemoryPreview, text]);

  const handleAutosave = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const payload = { text, ...linkedMetadata };
      await fetchJson(`/api/journal/autosave`, { method: 'POST', body: JSON.stringify(payload) });
      setLastSavedAt(new Date().toISOString());
    } catch (error) {
      console.warn('Autosave failed', error);
    } finally {
      setSaving(false);
    }
  }, [linkedMetadata, text]);

  useEffect(() => {
    if (autosaveRef.current) {
      clearInterval(autosaveRef.current);
    }
    autosaveRef.current = setInterval(() => {
      void handleAutosave();
    }, 10000);
    return () => {
      if (autosaveRef.current) clearInterval(autosaveRef.current);
    };
  }, [handleAutosave]);

  const submit = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const payload = { text, ...linkedMetadata, timestamp: new Date().toISOString() };
      await fetchJson(`/api/journal/create`, { method: 'POST', body: JSON.stringify(payload) });
      setText('');
      setArcSuggestions([]);
      setMemoryPreview([]);
      setLastSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }, [linkedMetadata, text]);

  return {
    text,
    setText,
    autoTagger,
    characterIndexer,
    moodEngine,
    arcSuggestions,
    memoryPreview,
    saving,
    lastSavedAt,
    submit
  };
};
