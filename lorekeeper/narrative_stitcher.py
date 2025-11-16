"""Narrative Stitcher for turning timeline events into story-like summaries."""
from __future__ import annotations

from collections import defaultdict, Counter
from dataclasses import dataclass
from datetime import datetime
from typing import List

from .event_schema import TimelineEvent


@dataclass
class NarrativeSection:
    theme: str
    events: List[TimelineEvent]
    summary: str


class NarrativeStitcher:
    """Cluster events by theme and generate a stitched storyline."""

    def __init__(self, max_sections: int = 5) -> None:
        self.max_sections = max_sections

    def _transition_score(self, current: TimelineEvent, candidate: TimelineEvent) -> float:
        tag_overlap = len(set(current.tags).intersection(candidate.tags))
        type_bonus = 1.0 if current.type == candidate.type and current.type else 0.0
        character_overlap = 0.0
        current_chars = set(current.metadata.get("characters", [])) if isinstance(current.metadata, dict) else set()
        candidate_chars = set(candidate.metadata.get("characters", [])) if isinstance(candidate.metadata, dict) else set()
        if current_chars and candidate_chars:
            character_overlap = len(current_chars.intersection(candidate_chars)) * 0.5
        density_bonus = max(0.0, 1.0 - abs(datetime.fromisoformat(candidate.date) - datetime.fromisoformat(current.date)).days / 30)
        return tag_overlap + type_bonus + character_overlap + density_bonus

    def _segment_score(self, segment: List[TimelineEvent]) -> float:
        if not segment:
            return 0.0
        tags = Counter()
        characters = Counter()
        for event in segment:
            tags.update(event.tags)
            if isinstance(event.metadata, dict):
                characters.update(event.metadata.get("characters", []))
        dominant_tag_count = max(tags.values() or [0])
        dominant_character_count = max(characters.values() or [0])
        sentiment_shift = 0.0
        sentiments = [
            score
            for event in segment
            if isinstance(event.metadata, dict)
            for score in [event.metadata.get("sentiment_score")]
            if isinstance(score, (int, float))
        ]
        if len(sentiments) >= 2:
            sentiment_shift = max(sentiments) - min(sentiments)
        cohesion = dominant_tag_count + dominant_character_count
        stability_penalty = 1.0 / (1.0 + sentiment_shift)
        return cohesion * stability_penalty + len(segment) * 0.2

    def _pick_theme(self, event: TimelineEvent) -> str:
        if event.tags:
            return event.tags[0]
        if event.type:
            return event.type
        return "misc"

    def cluster_events(self, events: List[TimelineEvent]) -> List[NarrativeSection]:
        buckets: dict[str, List[TimelineEvent]] = defaultdict(list)
        for event in events:
            buckets[self._pick_theme(event)].append(event)

        # order themes by frequency, then by recency of last event
        theme_counts = Counter({theme: len(items) for theme, items in buckets.items()})
        ordered_themes = [theme for theme, _ in theme_counts.most_common(self.max_sections)]

        sections: List[NarrativeSection] = []
        for theme in ordered_themes:
            themed_events = sorted(buckets[theme], key=lambda e: e.date)
            summary = self._summarize_theme(theme, themed_events)
            sections.append(NarrativeSection(theme=theme, events=themed_events, summary=summary))
        return sections

    def segment_events(self, events: List[TimelineEvent]) -> List[NarrativeSection]:
        """Dynamic programming segmentation that optimizes narrative coherence."""

        if not events:
            return []

        ordered = sorted(events, key=lambda e: e.date)
        n = len(ordered)
        dp_scores: List[float] = [0.0] * (n + 1)
        dp_paths: List[List[tuple[int, int]]] = [[] for _ in range(n + 1)]

        for i in range(1, n + 1):
            best_score = float("-inf")
            best_path: List[tuple[int, int]] = []
            lookback = max(0, i - self.max_sections * 3)
            for j in range(lookback, i):
                segment = ordered[j:i]
                score = dp_scores[j] + self._segment_score(segment)
                if score > best_score:
                    best_score = score
                    best_path = dp_paths[j] + [(j, i)]
            dp_scores[i] = best_score
            dp_paths[i] = best_path

        segments: List[NarrativeSection] = []
        for start, end in dp_paths[n]:
            segment = ordered[start:end]
            dominant_theme = self._pick_theme(segment[0]) if segment else "misc"
            summary = self._summarize_theme(dominant_theme, segment)
            segments.append(NarrativeSection(theme=dominant_theme, events=segment, summary=summary))
        return segments

    def _summarize_theme(self, theme: str, events: List[TimelineEvent]) -> str:
        if not events:
            return ""

        first_date = events[0].date
        last_date = events[-1].date
        headline = f"{theme.title()} arc from {first_date} to {last_date}"

        highlight_titles = ", ".join(event.title for event in events[:3])
        return f"{headline}: key beats include {highlight_titles}."

    def stitch(self, events: List[TimelineEvent]) -> str:
        if not events:
            return "No storyline available."

        sections = self.segment_events(events)
        story_fragments = [section.summary for section in sections if section.summary]
        serialized_dates = [datetime.fromisoformat(event.date).strftime("%b %d, %Y") for event in events]
        framing = f"Stitched {len(events)} events spanning {serialized_dates[0]} to {serialized_dates[-1]}."
        return " ".join([framing] + story_fragments)
