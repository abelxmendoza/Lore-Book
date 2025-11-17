from __future__ import annotations

import pytest

from .orchestrator import LoreOrchestrator
from .schema import AutopilotContext, ContinuityContext, IdentityContext, TimelineContext


class StubTimeline:
    def list_events(self):
        return [
            {"id": "e1", "title": "Event 1"},
            {"id": "e2", "title": "Event 2"},
        ]


class StubArc:
    def get_arcs(self):
        return [
            {"id": "arc-1", "title": "Rise"},
            {"id": "arc-2", "title": "Fall"},
        ]


class StubSeason:
    def get_current_season(self):
        return {"id": "s1", "label": "Season One"}


class StubIdentity:
    def get_identity_state(self):
        return {"motifs": ["resilience", "curiosity"], "emotional_slope": 0.4}


class StubPersona:
    def get_persona_state(self):
        return {"title": "Explorer", "biases": ["learning", "adventure"]}


class StubCharacter:
    def __init__(self):
        self._characters = [
            {"id": "c1", "name": "Avery"},
            {"id": "c2", "name": "Mira"},
        ]

    def list_characters(self):
        return self._characters

    def get_character(self, character_id):
        return next((c for c in self._characters if c["id"] == character_id), {})

    def get_relationships(self, character_id):
        return [
            {"from": character_id, "to": "c2", "type": "ally"},
        ]


class StubTasks:
    def list_tasks(self):
        return [
            {"id": "t1", "title": "Write"},
            {"id": "t2", "title": "Edit"},
        ]

    def get_momentum(self):
        return {"momentum_score": 0.82, "evidence": ["steady shipping"]}


class StubContinuity:
    def get_canonical_facts(self):
        return [
            {"fact": "Lives in Lumen City"},
        ]

    def get_conflicts(self):
        return [
            {"type": "timeline", "detail": "Two birthdays recorded"},
        ]


class StubAutopilot:
    def get_daily_signals(self):
        return {"next_action": "Draft chapter outline"}

    def get_weekly_signals(self):
        return {"focus": "Worldbuilding"}


class StubSaga:
    def get_saga(self):
        return {"title": "Reclamation", "chapters": 3}


class StubFabric:
    def __init__(self):
        self._neighbors = {
            "m1": [
                {"id": "m2", "type": "memory"},
                {"id": "m3", "type": "insight"},
            ]
        }

    def neighbors(self, memory_id):
        return self._neighbors.get(memory_id, [])


class StubHQI:
    def search_by_text(self, query):
        return [
            {"node_id": "m1", "score": 0.9, "reasons": ["semantic"]},
            {"node_id": "m2", "score": 0.7, "reasons": ["edge"]},
        ]


@pytest.fixture()
def orchestrator():
    return LoreOrchestrator(
        timeline_engine=StubTimeline(),
        memory_fabric=StubFabric(),
        hqi_engine=StubHQI(),
        arc_engine=StubArc(),
        season_engine=StubSeason(),
        identity_engine=StubIdentity(),
        persona_engine=StubPersona(),
        character_engine=StubCharacter(),
        task_engine=StubTasks(),
        continuity_engine=StubContinuity(),
        autopilot_engine=StubAutopilot(),
        saga_engine=StubSaga(),
    )


def test_timeline_context(orchestrator):
    timeline = orchestrator.get_timeline_context()
    assert isinstance(timeline, TimelineContext)
    assert len(timeline.events) == 2
    assert len(timeline.arcs) == 2
    assert timeline.season["label"] == "Season One"


def test_identity_and_continuity(orchestrator):
    identity = orchestrator.get_identity_context()
    continuity = orchestrator.get_continuity_state()

    assert isinstance(identity, IdentityContext)
    assert identity.identity["emotional_slope"] == 0.4
    assert identity.persona["title"] == "Explorer"

    assert isinstance(continuity, ContinuityContext)
    assert continuity.canonical[0]["fact"] == "Lives in Lumen City"
    assert continuity.conflicts[0]["type"] == "timeline"


def test_character_context(orchestrator):
    context = orchestrator.get_character_context("c1")
    assert context.character["name"] == "Avery"
    assert context.relationships[0]["to"] == "c2"


def test_autopilot_and_momentum(orchestrator):
    autopilot = orchestrator.get_autopilot_context()
    assert isinstance(autopilot, AutopilotContext)
    assert autopilot.daily["next_action"] == "Draft chapter outline"
    assert autopilot.weekly["focus"] == "Worldbuilding"
    assert autopilot.momentum["momentum_score"] == 0.82


def test_fabric_and_hqi(orchestrator):
    neighborhood = orchestrator.get_fabric_neighbors("m1")
    assert neighborhood.memory_id == "m1"
    assert len(neighborhood.neighbors) == 2

    hqi_results = orchestrator.get_hqi_search_results("plan")
    assert len(hqi_results.results) == 2
    assert hqi_results.results[0]["node_id"] == "m1"


def test_summary_includes_all_components(orchestrator):
    summary = orchestrator.get_summary()

    assert summary["identity"]["identity"]["motifs"] == ["resilience", "curiosity"]
    assert len(summary["timeline"]["events"]) == 2
    assert summary["autopilot"]["daily"]["next_action"] == "Draft chapter outline"
    assert len(summary["characters"]) == 2
    assert summary["saga"]["title"] == "Reclamation"
import unittest

from lorekeeper.orchestrator import LoreOrchestrator


class TestOrchestrator(unittest.TestCase):
    def test_summary(self):
        orchestrator = LoreOrchestrator("demo")
        summary = orchestrator.get_summary()
        self.assertIn("identity", summary.identity)
        self.assertIsNotNone(summary.persona)


if __name__ == "__main__":
    unittest.main()
