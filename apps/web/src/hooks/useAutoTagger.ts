import { useCallback, useEffect, useMemo, useState } from 'react';

import { autoTagRules, deriveTags } from '../utils/autoTagRules';

type TagSuggestion = {
  tag: string;
  rationale: string;
};

export const useAutoTagger = (initial: string[] = []) => {
  const [tags, setTags] = useState<string[]>(initial);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);

  const toggleTag = useCallback((tag: string) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  const refreshSuggestions = useCallback(
    (text: string) => {
      const derived = deriveTags(text);
      const rationales = autoTagRules
        .filter((rule) => rule.pattern.test(text))
        .map((rule) => ({ tag: rule.tag, rationale: rule.rationale }));

      setSuggestions(
        Array.from(new Map(rationales.map((item) => [item.tag, item])).values()).map((item) => ({
          tag: item.tag,
          rationale: item.rationale
        }))
      );
      setTags((prev) => Array.from(new Set([...prev, ...derived])));
    },
    []
  );

  const activeMap = useMemo(() => new Set(tags), [tags]);

  useEffect(() => {
    if (initial.length) {
      setTags(initial);
    }
  }, [initial]);

  return { tags, suggestions, toggleTag, refreshSuggestions, activeMap };
};
