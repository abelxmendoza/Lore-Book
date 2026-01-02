"""Lore Orchestrator: unified data layer for UI components."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from .schema import (
    AutopilotContext,
    CharacterContext,
    ContinuityContext,
    FabricNeighborhood,
    HQIResultSchema,
    IdentityContext,
    OrchestratorSummary,
    TimelineContext,
    dataclass_to_dict,
)


class LoreOrchestrator:
    """Facade that aggregates signals from every engine into a single API."""

    def __init__(
        self,
        timeline_engine: Any = None,
        memory_fabric: Any = None,
        hqi_engine: Any = None,
        arc_engine: Any = None,
        season_engine: Any = None,
        identity_engine: Any = None,
        persona_engine: Any = None,
        character_engine: Any = None,
        task_engine: Any = None,
        continuity_engine: Any = None,
        autopilot_engine: Any = None,
        saga_engine: Any = None,
    ) -> None:
        self.timeline_engine = timeline_engine
        self.memory_fabric = memory_fabric
        self.hqi_engine = hqi_engine
        self.arc_engine = arc_engine
        self.season_engine = season_engine
        self.identity_engine = identity_engine
        self.persona_engine = persona_engine
        self.character_engine = character_engine
        self.task_engine = task_engine
        self.continuity_engine = continuity_engine
        self.autopilot_engine = autopilot_engine
        self.saga_engine = saga_engine

    # ------------------------------------------------------------------
    # Public API consumed by UI
    # ------------------------------------------------------------------
    def get_summary(self) -> Dict[str, Any]:
        """Return the entire orchestrated snapshot as a JSON-friendly dict."""

        timeline = self.get_timeline_context()
        identity = self.get_identity_context()
        continuity = self.get_continuity_state()
        autopilot = self.get_autopilot_context()
        saga = self.get_saga_context()
        arc = self.get_arc_context()

        characters: List[CharacterContext] = []
        if hasattr(self.character_engine, "list_characters"):
            characters = [
                self.get_character_context(char.get("id") or char.get("character_id") or idx)
                for idx, char in enumerate(self.character_engine.list_characters())
            ]

        tasks = self._safe_call(self.task_engine, "list_tasks", default=[])

        summary = OrchestratorSummary(
            timeline=timeline,
            identity=identity,
            continuity=continuity,
            characters=characters,
            tasks=tasks,
            arcs=arc.arcs,
            season=arc.season,
            autopilot=autopilot,
            saga=saga,
        )
        return dataclass_to_dict(summary)

    def get_timeline_context(self) -> TimelineContext:
        events = self._safe_call(self.timeline_engine, "list_events", default=[])
        arcs = self._safe_call(self.arc_engine, "get_arcs", default=[])
        season = self._safe_call(self.season_engine, "get_current_season", default={})
        return TimelineContext(events=events, arcs=arcs, season=season)

    def get_character_context(self, character_id: Any) -> CharacterContext:
        character = self._safe_call(
            self.character_engine, "get_character", default={}, args=(character_id,)
        )
        relationships = self._safe_call(
            self.character_engine, "get_relationships", default=[], args=(character_id,)
        )
        return CharacterContext(character=character, relationships=relationships)

    def get_identity_context(self) -> IdentityContext:
        identity_state = self._safe_call(self.identity_engine, "get_identity_state", default={})
        persona_state = self._safe_call(self.persona_engine, "get_persona_state", default={})
        return IdentityContext(identity=identity_state, persona=persona_state)

    def get_continuity_state(self) -> ContinuityContext:
        canonical = self._safe_call(self.continuity_engine, "get_canonical_facts", default=[])
        conflicts = self._safe_call(self.continuity_engine, "get_conflicts", default=[])
        return ContinuityContext(canonical=canonical, conflicts=conflicts)

    def get_saga_context(self) -> Dict[str, Any]:
        saga = self._safe_call(self.saga_engine, "get_saga", default={})
        return saga or {}

    def get_arc_context(self) -> TimelineContext:
        arcs = self._safe_call(self.arc_engine, "get_arcs", default=[])
        season = self._safe_call(self.season_engine, "get_current_season", default={})
        events = self._safe_call(self.timeline_engine, "list_events", default=[])
        return TimelineContext(events=events, arcs=arcs, season=season)

    def get_autopilot_context(self) -> AutopilotContext:
        daily = self._safe_call(self.autopilot_engine, "get_daily_signals", default={})
        weekly = self._safe_call(self.autopilot_engine, "get_weekly_signals", default={})
        momentum = self._safe_call(self.task_engine, "get_momentum", default={})
        return AutopilotContext(daily=daily, weekly=weekly, momentum=momentum)

    def get_fabric_neighbors(self, memory_id: str) -> FabricNeighborhood:
        neighbors: List[Dict[str, Any]] = []
        if hasattr(self.memory_fabric, "neighbors"):
            neighbors = [self._node_to_dict(node) for node in self.memory_fabric.neighbors(memory_id)]
        return FabricNeighborhood(memory_id=memory_id, neighbors=neighbors)

    def get_hqi_search_results(self, query: str) -> HQIResultSchema:
        results: Iterable[Any] = []
        if hasattr(self.hqi_engine, "search_by_text"):
            results = self.hqi_engine.search_by_text(query)
        elif hasattr(self.hqi_engine, "search"):
            results = self.hqi_engine.search(query)
        normalized = [self._result_to_dict(result) for result in results]
        return HQIResultSchema(query=query, results=normalized)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _safe_call(
        self, engine: Any, method: str, default: Any, args: Optional[tuple] = None
    ) -> Any:
        if engine is None:
            return default
        func = getattr(engine, method, None)
        if not callable(func):
            return default
        args = args or tuple()
        try:
            return func(*args)
        except Exception:
            return default

    def _node_to_dict(self, node: Any) -> Dict[str, Any]:
        if hasattr(node, "__dict__"):
            return dict(node.__dict__)
        if isinstance(node, dict):
            return node
        return {"value": node}

    def _result_to_dict(self, result: Any) -> Dict[str, Any]:
        if isinstance(result, dict):
            return result
        if hasattr(result, "__dict__"):
            return dict(result.__dict__)
        return {"result": result}
"""
Lore Orchestrator — Central data aggregation layer for all engines.
"""

from .schema import (
    ArcContext,
    AutopilotContext,
    CharacterContext,
    ContinuityContext,
    FabricCluster,
    HQIResult,
    IdentityContext,
    OrchestratorSummary,
    SagaContext,
    TimelineContext,
)


class _TimelineManager:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_events(self):
        return []


class _IdentityEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_state(self):
        return {"identity": {"user_id": self.user_id}}

    def get_pulse(self):
        return {"status": "stable"}


class _PersonaEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_snapshot(self):
        return {"persona": "default"}


class _WeeklyArcEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_latest_arc(self):
        return {"title": "Demo Arc", "owner": self.user_id}

    def list_arcs(self):
        return []

    def list_monthly(self):
        return []


class _SeasonEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_current_season(self):
        return {"name": "Season 1", "user_id": self.user_id}

    def get_all_seasons(self):
        return []


class _SagaEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_saga_state(self):
        return {"status": "draft", "user_id": self.user_id}

    def get_saga_context(self):
        return SagaContext(seasons=[], arcs=[], turning_points=[])


class _ContinuityEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_state(self):
        return {"stability": "steady"}

    def get_context(self):
        return ContinuityContext(
            canonical_facts=[],
            conflicts=[],
            stability={"score": 1.0},
        )

    def get_drift_report(self):
        return []


class _AutopilotEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_context(self):
        return AutopilotContext(daily={}, weekly={}, alerts=[])


class _HQIEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def search(self, query: str):
        return HQIResult(query=query, results=[])


class _MemoryFabric:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_neighbors(self, memory_id: str):
        return FabricCluster(memory_id=memory_id, neighbors=[])


class _CharacterEngine:
    def __init__(self, user_id: str):
        self.user_id = user_id

    def get_character_context(self, character_id: str):
        return CharacterContext(
            profile={"id": character_id, "user_id": self.user_id},
            relationships=[],
            shared_memories=[],
            closeness_trend=[],
        )


class LoreOrchestrator:
    def __init__(self, user_id: str):
        self.user_id = user_id

        self.timeline = _TimelineManager(user_id)
        self.identity = _IdentityEngine(user_id)
        self.persona = _PersonaEngine(user_id)
        self.arcs = _WeeklyArcEngine(user_id)
        self.seasons = _SeasonEngine(user_id)
        self.saga = _SagaEngine(user_id)
        self.continuity = _ContinuityEngine(user_id)
        self.fabric = _MemoryFabric(user_id)
        self.hqi = _HQIEngine(user_id)
        self.autopilot = _AutopilotEngine(user_id)
        self.characters = _CharacterEngine(user_id)

    # ---- HIGH LEVEL ----
    def get_summary(self) -> OrchestratorSummary:
        return OrchestratorSummary(
            identity=self.identity.get_state(),
            persona=self.persona.get_snapshot(),
            arcs=self.arcs.get_latest_arc(),
            tasks={},
            continuity=self.continuity.get_state(),
            season=self.seasons.get_current_season(),
            saga=self.saga.get_saga_state(),
        )

    # ---- SPECIFIC CONTEXTS ----
    def get_timeline_context(self) -> TimelineContext:
        return TimelineContext(
            events=self.timeline.get_events(),
            arcs=self.arcs.list_arcs(),
            seasons=self.seasons.get_all_seasons(),
            drift=self.continuity.get_drift_report(),
        )

    def get_identity_context(self) -> IdentityContext:
        return IdentityContext(
            identity_state=self.identity.get_state(),
            persona_state=self.persona.get_snapshot(),
            pulse=self.identity.get_pulse(),
        )

    def get_continuity_context(self) -> ContinuityContext:
        return self.continuity.get_context()

    def get_character_context(self, character_id: str) -> CharacterContext:
        return self.characters.get_character_context(character_id)

    def get_saga_context(self) -> SagaContext:
        return self.saga.get_saga_context()

    def get_arc_context(self) -> ArcContext:
        return ArcContext(
            weekly_arcs=self.arcs.list_arcs(),
            monthly_arcs=self.arcs.list_monthly(),
        )

    def get_autopilot_context(self) -> AutopilotContext:
        return self.autopilot.get_context()

    def search_hqi(self, query: str) -> HQIResult:
        return self.hqi.search(query)

    def get_fabric_neighbors(self, memory_id: str) -> FabricCluster:
        return self.fabric.get_neighbors(memory_id)
