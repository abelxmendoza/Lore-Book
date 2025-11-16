"""Drift Auditor scans timeline events for contradictions or drift."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import List

from .event_schema import TimelineEvent


@dataclass
class DriftFlag:
    event_ids: List[str]
    issue: str
    severity: str
    notes: str


class DriftAuditor:
    """Simple heuristic auditor for detecting potential timeline drift."""

    def audit(self, events: List[TimelineEvent]) -> List[DriftFlag]:
        flags: List[DriftFlag] = []

        # Duplicate titles on the same date often signal conflicting recollections.
        keyed = defaultdict(list)
        for event in events:
            keyed[(event.date, event.title.lower())].append(event)

        for (event_date, title), grouped in keyed.items():
            if len(grouped) > 1:
                details = {e.details for e in grouped}
                if len(details) > 1:
                    flags.append(
                        DriftFlag(
                            event_ids=[e.id for e in grouped],
                            issue="Conflicting recounts",
                            severity="high",
                            notes=f"{len(grouped)} variants of '{title}' on {event_date} with different details.",
                        )
                    )

        # Flag events that were marked as corrections but still unarchived originals
        correction_ids = {event.id for event in events if event.type == "correction"}
        for event in events:
            if event.archived is False and event.id in correction_ids:
                flags.append(
                    DriftFlag(
                        event_ids=[event.id],
                        issue="Correction not archived",
                        severity="medium",
                        notes="Correction present without archiving original entry.",
                    )
                )

        return flags
