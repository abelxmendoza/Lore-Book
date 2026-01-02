"""Continuity engine package for LoreKeeper."""

from .engine import ContinuityEngine
from .facts import CanonicalFact, CanonicalRegistry, FactSource, extract_facts_from_events
from .conflicts import ContinuityConflict
from .drift_rules import DriftSignal
from .report import ContinuityReport

__all__ = [
    "CanonicalFact",
    "CanonicalRegistry",
    "ContinuityConflict",
    "ContinuityEngine",
    "ContinuityReport",
    "DriftSignal",
    "FactSource",
    "extract_facts_from_events",
]
