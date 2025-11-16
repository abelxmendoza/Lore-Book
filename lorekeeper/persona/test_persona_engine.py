from __future__ import annotations

import unittest

from ..event_schema import TimelineEvent
from ..identity.identity_engine import IdentityEngine
from .persona_engine import OmegaPersonaEngine
from .persona_rules import build_behavior_rules


class DummyTimelineManager:
    def __init__(self, events):
        self._events = list(events)

    def get_events(self, **_kwargs):
        return list(self._events)


class DummySeasonEngine:
    def __init__(self, theme="Rebuild"):
        self.theme = theme

    def gather_season_range(self, *_, **__):
        return {"monthly_arcs": [{"arc": {"themes": [self.theme]}}], "events": []}

    def detect_season_themes(self, monthly_arcs, _events):
        themes = []
        for arc in monthly_arcs:
            themes.extend(arc.get("arc", {}).get("themes", []))
        return themes


class PersonaEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.events = [
            TimelineEvent(date="2024-01-01", title="New gym habit", type="habit", tags=["discipline", "grind"], metadata={"sentiment": 0.2}),
            TimelineEvent(date="2024-02-14", title="Won regional", type="fight", tags=["win", "bjj"], metadata={"sentiment": 0.7}),
            TimelineEvent(date="2024-03-10", title="Hit burnout", type="reflection", tags=["burnout", "drift"], metadata={"sentiment": -0.3}),
            TimelineEvent(date="2024-04-05", title="Reset and focused", type="reset", tags=["reset", "discipline"], metadata={"sentiment": 0.1}),
            TimelineEvent(date="2024-05-01", title="Built robot arm", type="project", tags=["robotics", "build"], metadata={"sentiment": 0.6}),
        ]
        timeline = DummyTimelineManager(self.events)
        identity = IdentityEngine(None, timeline_manager=timeline, character_graph=None, tagdict={})
        self.engine = OmegaPersonaEngine(identity, timeline, DummySeasonEngine())

    def test_persona_derivation(self) -> None:
        version = self.engine.derive_persona_version()
        self.assertIn("Rebuild", version)
        motifs = self.engine.derive_motifs()
        self.assertTrue(motifs)
        self.assertIn("discipline", ",".join(motifs))

    def test_behavioral_biases_and_slopes(self) -> None:
        biases = self.engine.derive_behavioral_biases()
        self.assertIn("journaling_rhythm", biases)
        self.assertIn("burnout_reset_loops", biases)

    def test_voice_traits_follow_emotions(self) -> None:
        voice = self.engine.derive_voice_traits()
        self.assertIn(voice["emotional_trend"], {"rising", "falling", "stable"})
        self.assertIn("tone", voice)

    def test_update_persona_state_tracks_history(self) -> None:
        state = self.engine.update_persona_state()
        self.assertEqual(self.engine.current_state, state)
        self.assertGreaterEqual(len(self.engine.state_history), 1)
        rules = build_behavior_rules(state)
        self.assertIn("tone", rules)

    def test_generate_description_reads_state(self) -> None:
        state = self.engine.update_persona_state()
        description = self.engine.generate_persona_description(state)
        self.assertIn("Omega Persona Snapshot", description)
        self.assertIn(state.version, description)
        self.assertIn("emotional", description.lower())

    def test_emotional_slope_influences_voice(self) -> None:
        # Add a negative event to tilt slope
        bad_event = TimelineEvent(date="2024-06-01", title="Setback", type="failure", tags=["failure"], metadata={"sentiment": -0.9})
        self.engine.update_persona_state(bad_event)
        voice = self.engine.derive_voice_traits([*self.events, bad_event])
        self.assertIn(voice["tone"], {"grounded", "energized", "observant"})

    def test_export_state_includes_history(self) -> None:
        self.engine.update_persona_state()
        exported = self.engine.export_state()
        self.assertIn("rules", exported)
        self.assertIn("history", exported)
        self.assertTrue(exported["history"])
        self.assertIsInstance(exported["last_updated"], str)


if __name__ == "__main__":
    unittest.main()
