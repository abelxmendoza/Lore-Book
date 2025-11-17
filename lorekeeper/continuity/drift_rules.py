"""Drift analysis helpers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

from .facts import CanonicalFact


@dataclass
class DriftSignal:
    subject: str
    attribute: str
    drift_score: float
    segments: List[Tuple[str, str]]
    notes: str


def compute_drift_signals(facts: Iterable[CanonicalFact]) -> List[DriftSignal]:
    grouped: Dict[Tuple[str, str], List[CanonicalFact]] = {}
    for fact in facts:
        grouped.setdefault((fact.subject, fact.attribute), []).append(fact)

    signals: List[DriftSignal] = []
    for (subject, attribute), fact_history in grouped.items():
        seasons = [str(source.metadata.get("season")) for fact in fact_history for source in fact.sources if source.metadata]
        unique_values = {str(f.value) for f in fact_history}
        drift_score = min(1.0, (len(unique_values) - 1) * 0.25) if len(unique_values) > 1 else 0.0
        if seasons:
            segments = sorted({s for s in seasons if s and s != "None"})
        else:
            segments = []
        notes = "Stable" if drift_score == 0 else f"Observed {len(unique_values)} versions"
        signals.append(DriftSignal(subject=subject, attribute=attribute, drift_score=drift_score, segments=segments, notes=notes))
    return signals


def summarize_drift(signals: Iterable[DriftSignal]) -> Dict[str, float]:
    signals_list = list(signals)
    if not signals_list:
        return {"character": 1.0, "identity": 1.0, "project": 1.0, "location": 1.0}

    avg = sum(s.drift_score for s in signals_list) / len(signals_list)
    # Map to high-level buckets
    return {
        "character": max(0.0, 1.0 - avg * 0.5),
        "identity": max(0.0, 1.0 - avg * 0.6),
        "project": max(0.0, 1.0 - avg * 0.4),
        "location": max(0.0, 1.0 - avg * 0.3),
    }
