"""Summaries for external milestones."""

from typing import Iterable, List

from .schemas import ExternalEvent, ExternalSummary


def summarize_milestones(events: Iterable[ExternalEvent]) -> List[ExternalSummary]:
    summaries: List[ExternalSummary] = []
    for event in events:
        summary = _render_summary(event)
        summaries.append(
            ExternalSummary(
                source=event.source,
                timestamp=event.timestamp,
                type=event.type,
                text=event.text,
                image_url=event.image_url,
                tags=list(event.tags),
                characters=list(event.characters),
                milestone=event.milestone,
                summary=summary,
            )
        )
    return summaries


def _render_summary(event: ExternalEvent) -> str:
    base = f"{event.source} {event.type}".strip()
    if event.text:
        return f"{base}: {event.text}"
    return base
