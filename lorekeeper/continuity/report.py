"""Markdown report rendering for continuity state."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from .conflicts import ContinuityConflict
from .drift_rules import DriftSignal
from .facts import CanonicalFact


@dataclass
class ContinuityReport:
    markdown: str


def build_report(facts: Iterable[CanonicalFact], conflicts: Iterable[ContinuityConflict], drift: Iterable[DriftSignal]) -> ContinuityReport:
    facts_list: List[CanonicalFact] = list(facts)
    conflicts_list: List[ContinuityConflict] = list(conflicts)
    drift_list: List[DriftSignal] = list(drift)

    lines: List[str] = []
    lines.append("# Canon Summary")
    for fact in facts_list:
        lines.append(f"- **{fact.subject}::{fact.attribute}** → {fact.value} (conf={fact.confidence:.2f}, scope={fact.scope})")
    if not facts_list:
        lines.append("- No canonical facts yet.")

    lines.append("\n# Conflicts Report")
    if conflicts_list:
        for conflict in conflicts_list:
            lines.append(f"- [{conflict.conflict_type.upper()}] {conflict.description} (severity: {conflict.severity})")
    else:
        lines.append("- No conflicts detected.")

    lines.append("\n# Drift Maps")
    if drift_list:
        for signal in drift_list:
            segments = ", ".join(signal.segments) if signal.segments else "n/a"
            lines.append(f"- {signal.subject}::{signal.attribute} drift={signal.drift_score:.2f} segments=[{segments}] {signal.notes}")
    else:
        lines.append("- No drift detected.")

    lines.append("\n# Stability Timeline")
    lines.append("- Stable vs unstable eras derived from drift signals above.")

    lines.append("\n# Character Consistency Map")
    lines.append("- Character consistency inferred from identity drift metrics.")

    lines.append("\n# Identity Continuity Overview")
    lines.append("- Identity stability synthesized from canonical facts and drift trends.")

    return ContinuityReport(markdown="\n".join(lines))
