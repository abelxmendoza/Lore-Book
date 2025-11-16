"""O(1) tag lookup structure for LoreKeeper events."""
from __future__ import annotations

from collections import Counter, defaultdict
from typing import Dict, Iterable, List, Optional, Set


class TagDictionary:
    def __init__(self) -> None:
        self.tag_map: Dict[str, Set[str]] = defaultdict(set)
        self.tag_freq: Counter[str] = Counter()
        self.tag_cooccurrence_map: Dict[str, Counter[str]] = defaultdict(Counter)

    def add(self, event_id: str, tags: Iterable[str]) -> None:
        tag_list = [tag.lower() for tag in tags if tag]
        for tag in tag_list:
            self.tag_map[tag].add(event_id)
            self.tag_freq[tag] += 1
        for i, tag in enumerate(tag_list):
            for other in tag_list[i + 1 :]:
                self.tag_cooccurrence_map[tag][other] += 1
                self.tag_cooccurrence_map[other][tag] += 1

    def remove(self, event_id: str, tags: Iterable[str]) -> None:
        for tag in tags:
            normalized = tag.lower()
            if event_id in self.tag_map.get(normalized, set()):
                self.tag_map[normalized].discard(event_id)
                self.tag_freq[normalized] -= 1
                if self.tag_freq[normalized] <= 0:
                    self.tag_map.pop(normalized, None)
                    self.tag_freq.pop(normalized, None)
                    self.tag_cooccurrence_map.pop(normalized, None)

    def get(self, tag: str) -> Set[str]:
        return set(self.tag_map.get(tag.lower(), set()))

    def most_common(self, limit: int = 10) -> List[tuple[str, int]]:
        return self.tag_freq.most_common(limit)

    def cooccurrence(self, tag: str, limit: int = 5) -> List[tuple[str, int]]:
        counter = self.tag_cooccurrence_map.get(tag.lower(), Counter())
        return counter.most_common(limit)

    def related_tags(self, tags: Iterable[str], limit: int = 5) -> List[str]:
        scores: Counter[str] = Counter()
        for tag in tags:
            scores.update(self.tag_cooccurrence_map.get(tag.lower(), Counter()))
        for tag in tags:
            scores.pop(tag.lower(), None)
        return [tag for tag, _ in scores.most_common(limit)]

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self.tag_map)

    def __contains__(self, tag: str) -> bool:  # pragma: no cover - trivial
        return tag.lower() in self.tag_map
