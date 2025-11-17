"""Continuity engine implementation."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List

from lorekeeper.event_schema import TimelineEvent

from .audit import ContinuityAudit
from .conflicts import ContinuityConflict, detect_conflicts
from .drift_rules import DriftSignal, compute_drift_signals, summarize_drift
from .facts import CanonicalFact, CanonicalRegistry, extract_facts_from_events
from .merge_rules import (
    merge_location_fuzzy_match,
    merge_motif_drift,
    merge_name_drift,
    merge_numerical_drift,
    merge_relationship_drift,
    merge_repeated_fragment,
    merge_tag_drift,
)
from .report import ContinuityReport, build_report


@dataclass
class ContinuityState:
    registry: CanonicalRegistry
    conflicts: List[ContinuityConflict]
    drift_signals: List[DriftSignal]
    drift_summary: Dict[str, float]
    score: float
    audit: ContinuityAudit
    report: ContinuityReport


class ContinuityEngine:
    """The Canon Keeper responsible for stabilizing LoreKeeper knowledge."""

    def extract_facts(self, events: Iterable[TimelineEvent]) -> List[CanonicalFact]:
        return extract_facts_from_events(events)

    def build_registry(self, events: Iterable[TimelineEvent] | List[CanonicalFact]) -> CanonicalRegistry:
        registry = CanonicalRegistry()
        materialized = list(events)
        if materialized and isinstance(materialized[0], CanonicalFact):  # type: ignore[arg-type]
            facts_iterable = materialized  # type: ignore[assignment]
        else:
            facts_iterable = extract_facts_from_events(materialized)  # type: ignore[arg-type]

        for fact in facts_iterable:  # type: ignore[assignment]
            registry.add_fact(fact)
        return registry

    def analyze(self, events: Iterable[TimelineEvent]) -> ContinuityState:
        events_list = list(events)
        extracted_facts = self.extract_facts(events_list)
        registry = self.build_registry(extracted_facts)
        conflicts = detect_conflicts(extracted_facts, events_list)
        drift_signals = compute_drift_signals(registry.facts)
        drift_summary = summarize_drift(drift_signals)

        audit = ContinuityAudit()
        audit.add_conflicts(conflicts)
        for signal in drift_signals:
            if signal.drift_score > 0.5:
                audit.suggest(f"Drift detected for {signal.subject}::{signal.attribute}; consider prompting correction")

        score = self._compute_continuity_score(conflicts, drift_signals)
        report = build_report(registry.facts, conflicts, drift_signals)

        return ContinuityState(
            registry=registry,
            conflicts=conflicts,
            drift_signals=drift_signals,
            drift_summary=drift_summary,
            score=score,
            audit=audit,
            report=report,
        )

    def merge_fact_variants(self, facts: List[CanonicalFact]) -> CanonicalFact | None:
        if not facts:
            return None
        values = [f.value for f in facts]
        if all(isinstance(v, (int, float)) for v in values):
            merged_value, confidence, notes = merge_numerical_drift([float(v) for v in values])
        elif any(isinstance(v, list) for v in values):
            merged_value, confidence, notes = merge_tag_drift([v if isinstance(v, list) else [v] for v in values])
        elif any(isinstance(v, tuple) and len(v) == 2 for v in values):
            merged_value, confidence, notes = merge_relationship_drift([v for v in values if isinstance(v, tuple)])
        else:
            merged_value, confidence, notes = merge_repeated_fragment([str(v) for v in values])

        merged_fact = facts[0]
        merged_fact.value = merged_value
        merged_fact.confidence = confidence
        merged_fact.sources[0].metadata["notes"] = notes
        return merged_fact

    def render_report(self, state: ContinuityState) -> str:
        return state.report.markdown

    def _compute_continuity_score(self, conflicts: List[ContinuityConflict], drift_signals: List[DriftSignal]) -> float:
        base = 100.0
        conflict_penalty = len(conflicts) * 5
        drift_penalty = sum(signal.drift_score for signal in drift_signals) * 10
        return max(0.0, base - conflict_penalty - drift_penalty)

    def suggest_corrections(self, conflicts: List[ContinuityConflict]) -> List[str]:
        suggestions = []
        for conflict in conflicts:
            if conflict.conflict_type == "factual":
                suggestions.append("Clarify the source of conflicting facts or pick the most recent verified entry.")
            elif conflict.conflict_type == "temporal":
                suggestions.append("Adjust event timings to remove impossible overlaps.")
            elif conflict.conflict_type == "identity":
                suggestions.append("Stabilize the active persona version before proceeding.")
            elif conflict.conflict_type == "task":
                suggestions.append("Reconcile the task status to avoid duplicate states.")
        return suggestions

    # Convenience accessors for explicit merge rule access
    @property
    def merge_rules(self):  # pragma: no cover - passthrough helper
        return {
            "numerical": merge_numerical_drift,
            "tags": merge_tag_drift,
            "name": merge_name_drift,
            "motif": merge_motif_drift,
            "relationship": merge_relationship_drift,
            "fragment": merge_repeated_fragment,
            "location": merge_location_fuzzy_match,
        }
