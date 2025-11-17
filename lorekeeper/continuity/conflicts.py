"""Conflict detection utilities."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List

from lorekeeper.event_schema import TimelineEvent

from .facts import CanonicalFact


@dataclass
class ContinuityConflict:
    """Represents a continuity issue across facts or events."""

    conflict_type: str
    description: str
    severity: str
    subjects: List[str]
    evidence: List[str]
    attributes: List[str] | None = None


_DATE_FORMATS = ["%Y-%m-%d", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"]


def detect_fact_conflicts(facts: Iterable[CanonicalFact]) -> List[ContinuityConflict]:
    grouped = defaultdict(list)
    for fact in facts:
        grouped[(fact.subject.lower(), fact.attribute.lower())].append(fact)

    conflicts: List[ContinuityConflict] = []
    for (subject, attribute), facts_for_key in grouped.items():
        values = {str(f.value) for f in facts_for_key}
        if len(values) > 1:
            conflicts.append(
                ContinuityConflict(
                    conflict_type="factual",
                    description=f"Conflicting values for {attribute}: {', '.join(sorted(values))}",
                    severity="high",
                    subjects=[subject],
                    attributes=[attribute],
                    evidence=[s.reference for f in facts_for_key for s in f.sources],
                )
            )
    return conflicts


def detect_temporal_conflicts(events: Iterable[TimelineEvent]) -> List[ContinuityConflict]:
    conflicts: List[ContinuityConflict] = []
    dated_events = [e for e in events if e.metadata.get("start") or e.metadata.get("end")]
    for i, event in enumerate(dated_events):
        for other in dated_events[i + 1 :]:
            if _overlaps(event, other):
                conflicts.append(
                    ContinuityConflict(
                        conflict_type="temporal",
                        description=f"Events '{event.title}' and '{other.title}' overlap impossibly",
                        severity="medium",
                        subjects=[event.metadata.get("subject") or event.title, other.metadata.get("subject") or other.title],
                        evidence=[event.id, other.id],
                        attributes=["date"],
                    )
                )
    return conflicts


def detect_task_conflicts(events: Iterable[TimelineEvent]) -> List[ContinuityConflict]:
    conflicts: List[ContinuityConflict] = []
    grouped = defaultdict(list)
    for event in events:
        if event.type != "task":
            continue
        grouped[event.metadata.get("task_id", event.title)].append(event)

    for task_id, task_events in grouped.items():
        statuses = {e.metadata.get("status", e.details) for e in task_events}
        if len(statuses) > 1:
            conflicts.append(
                ContinuityConflict(
                    conflict_type="task",
                    description=f"Task {task_id} has conflicting statuses: {', '.join(sorted(statuses))}",
                    severity="medium",
                    subjects=[task_id],
                    evidence=[e.id for e in task_events],
                    attributes=["status"],
                )
            )
    return conflicts


def detect_arc_conflicts(events: Iterable[TimelineEvent]) -> List[ContinuityConflict]:
    conflicts: List[ContinuityConflict] = []
    turning_points = defaultdict(list)
    for event in events:
        if event.metadata.get("turning_point"):
            turning_points[event.metadata.get("turning_point")].append(event)

    for turning_point, matches in turning_points.items():
        summaries = {e.details for e in matches}
        if len(summaries) > 1:
            conflicts.append(
                ContinuityConflict(
                    conflict_type="arc",
                    description=f"Turning point '{turning_point}' recorded with multiple narratives",
                    severity="medium",
                    subjects=[turning_point],
                    evidence=[e.id for e in matches],
                    attributes=["turning_point"],
                )
            )
    return conflicts


def detect_identity_conflicts(facts: Iterable[CanonicalFact]) -> List[ContinuityConflict]:
    conflicts: List[ContinuityConflict] = []
    version_facts = [f for f in facts if f.attribute in {"identity_version", "tone"}]
    if len({f.value for f in version_facts}) > 1:
        conflicts.append(
            ContinuityConflict(
                conflict_type="identity",
                description="Identity or tone drift detected across canonical facts",
                severity="medium",
                subjects=[f.subject for f in version_facts],
                attributes=["identity_version", "tone"],
                evidence=[s.reference for f in version_facts for s in f.sources],
            )
        )
    return conflicts


def detect_conflicts(facts: Iterable[CanonicalFact], events: Iterable[TimelineEvent]) -> List[ContinuityConflict]:
    conflicts: List[ContinuityConflict] = []
    conflicts.extend(detect_fact_conflicts(facts))
    conflicts.extend(detect_temporal_conflicts(events))
    conflicts.extend(detect_task_conflicts(events))
    conflicts.extend(detect_arc_conflicts(events))
    conflicts.extend(detect_identity_conflicts(facts))
    return conflicts


def _parse_date(value: str) -> datetime | None:
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _overlaps(a: TimelineEvent, b: TimelineEvent) -> bool:
    a_start = a.metadata.get("start") or a.date
    a_end = a.metadata.get("end") or a.date
    b_start = b.metadata.get("start") or b.date
    b_end = b.metadata.get("end") or b.date

    start_a = _parse_date(a_start)
    end_a = _parse_date(a_end)
    start_b = _parse_date(b_start)
    end_b = _parse_date(b_end)
    if None in {start_a, end_a, start_b, end_b}:
        return False

    return start_a <= end_b <= end_a or start_b <= end_a <= end_b or (start_a <= start_b <= end_a)
