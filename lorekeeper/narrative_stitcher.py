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

        sections = self.cluster_events(events)
        story_fragments = [section.summary for section in sections if section.summary]
        serialized_dates = [datetime.fromisoformat(event.date).strftime("%b %d, %Y") for event in events]
        framing = f"Stitched {len(events)} events spanning {serialized_dates[0]} to {serialized_dates[-1]}."
        return " ".join([framing] + story_fragments)
