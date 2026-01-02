"""Shared schema for Lore Orchestrator outputs."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


@dataclass
class TimelineContext:
    """Aggregated timeline view (events + arcs + season)."""

    events: List[Any] = field(default_factory=list)
    arcs: List[Any] = field(default_factory=list)
    season: Dict[str, Any] = field(default_factory=dict)
"""
Typed dataclasses defining unified orchestrator output.
"""

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass
class OrchestratorSummary:
    identity: Dict[str, Any]
    persona: Dict[str, Any]
    arcs: Dict[str, Any]
    tasks: Dict[str, Any]
    continuity: Dict[str, Any]
    season: Dict[str, Any]
    saga: Dict[str, Any]


@dataclass
class TimelineContext:
    events: List[Dict[str, Any]]
    arcs: List[Dict[str, Any]]
    seasons: List[Dict[str, Any]]
    drift: List[Dict[str, Any]]


@dataclass
class IdentityContext:
    """Identity + persona snapshot."""

    identity: Dict[str, Any] = field(default_factory=dict)
    persona: Dict[str, Any] = field(default_factory=dict)
    identity_state: Dict[str, Any]
    persona_state: Dict[str, Any]
    pulse: Dict[str, Any]


@dataclass
class ContinuityContext:
    canonical_facts: List[Dict[str, Any]]
    conflicts: List[Dict[str, Any]]
    stability: Dict[str, Any]


@dataclass
class CharacterContext:
    """Character state + relationship graph."""

    character: Dict[str, Any] = field(default_factory=dict)
    relationships: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ContinuityContext:
    """Continuity canonical facts and conflicts."""

    canonical: List[Dict[str, Any]] = field(default_factory=list)
    conflicts: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class AutopilotContext:
    """Autopilot momentum and guidance signals."""

    daily: Dict[str, Any] = field(default_factory=dict)
    weekly: Dict[str, Any] = field(default_factory=dict)
    momentum: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FabricNeighborhood:
    """Graph neighborhood for a given memory node."""

    memory_id: str
    neighbors: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class HQIResultSchema:
    """Search results coming out of the HQI engine."""

    query: str
    results: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class OrchestratorSummary:
    """Unified payload presented to the UI via the orchestrator."""

    timeline: TimelineContext
    identity: IdentityContext
    continuity: ContinuityContext
    characters: List[CharacterContext] = field(default_factory=list)
    tasks: List[Dict[str, Any]] = field(default_factory=list)
    arcs: List[Any] = field(default_factory=list)
    season: Dict[str, Any] = field(default_factory=dict)
    autopilot: AutopilotContext = field(default_factory=AutopilotContext)
    saga: Dict[str, Any] = field(default_factory=dict)
    hqi: Optional[HQIResultSchema] = None
    fabric: Optional[FabricNeighborhood] = None


def dataclass_to_dict(data: Any) -> Any:
    """Recursively convert dataclasses to dictionaries for JSON responses."""

    if hasattr(data, "__dataclass_fields__"):
        return {key: dataclass_to_dict(value) for key, value in asdict(data).items()}
    if isinstance(data, list):
        return [dataclass_to_dict(item) for item in data]
    if isinstance(data, dict):
        return {key: dataclass_to_dict(value) for key, value in data.items()}
    return data
    profile: Dict[str, Any]
    relationships: List[Dict[str, Any]]
    shared_memories: List[Dict[str, Any]]
    closeness_trend: List[Dict[str, Any]]


@dataclass
class SagaContext:
    seasons: List[Dict[str, Any]]
    arcs: List[Dict[str, Any]]
    turning_points: List[Dict[str, Any]]


@dataclass
class ArcContext:
    weekly_arcs: List[Dict[str, Any]]
    monthly_arcs: List[Dict[str, Any]]


@dataclass
class AutopilotContext:
    daily: Dict[str, Any]
    weekly: Dict[str, Any]
    alerts: List[Dict[str, Any]]


@dataclass
class HQIResult:
    query: str
    results: List[Dict[str, Any]]


@dataclass
class FabricCluster:
    memory_id: str
    neighbors: List[Dict[str, Any]]
