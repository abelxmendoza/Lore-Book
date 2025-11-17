"""External Signals Hub orchestrator."""

from typing import Iterable, List

from .classifiers import classify
from .filters import filter_noise
from .schemas import ExternalEvent, ExternalSummary
from .summarizer import summarize_milestones


class ExternalHub:
    """High-level orchestrator that normalizes and summarizes events."""

    def run(self, normalized_events: Iterable[ExternalEvent]) -> List[ExternalSummary]:
        filtered = filter_noise(normalized_events)
        milestones = classify(filtered)
        summaries = summarize_milestones(milestones)
        return summaries
