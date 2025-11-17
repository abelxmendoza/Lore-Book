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
