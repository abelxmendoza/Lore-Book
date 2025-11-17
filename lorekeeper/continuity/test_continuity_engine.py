"""Unit tests for the ContinuityEngine."""
from __future__ import annotations

import unittest

from lorekeeper.event_schema import TimelineEvent

from .conflicts import detect_conflicts
from .engine import ContinuityEngine
from .merge_rules import (
    merge_location_fuzzy_match,
    merge_motif_drift,
    merge_name_drift,
    merge_numerical_drift,
    merge_relationship_drift,
    merge_repeated_fragment,
    merge_tag_drift,
)


class ContinuityEngineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = ContinuityEngine()

    def _build_test_events(self):
        return [
            TimelineEvent(
                id="bio-1",
                date="2024-01-01",
                title="Bio Entry",
                type="bio",
                details="Early record",
                tags=["identity"],
                metadata={"subject": "Alex", "attribute": "birthday", "value": "1990-01-01", "confidence": 0.95},
            ),
            TimelineEvent(
                id="bio-2",
                date="2024-02-01",
                title="Bio Entry",
                type="bio",
                details="Second record",
                tags=["identity"],
                metadata={"subject": "Alex", "attribute": "birthday", "value": "1990-01-01", "confidence": 0.9},
            ),
            TimelineEvent(
                id="bio-3",
                date="2024-03-01",
                title="Bio Entry",
                type="bio",
                details="Conflicting record",
                tags=["identity"],
                metadata={"subject": "Alex", "attribute": "birthday", "value": "1991-03-01", "confidence": 0.4},
            ),
            TimelineEvent(
                id="home",
                date="2024-04-01",
                title="Hometown",
                type="identity",
                tags=["identity"],
                metadata={"subject": "Alex", "attribute": "hometown", "value": "Seattle", "permanent": True},
            ),
            TimelineEvent(
                id="rule",
                date="2024-04-02",
                title="Lore Rule",
                type="identity",
                tags=["identity"],
                metadata={
                    "subject": "Alex",
                    "attribute": "hometown",
                    "value": "Seattle",
                    "rule": "Never contradict hometown",
                    "scope": "rule",
                },
            ),
            TimelineEvent(
                id="overlap-1",
                date="2024-05-01T10:00",
                title="Meeting A",
                type="event",
                metadata={"subject": "Alex", "start": "2024-05-01T10:00", "end": "2024-05-01T11:00"},
            ),
            TimelineEvent(
                id="overlap-2",
                date="2024-05-01T10:30",
                title="Meeting B",
                type="event",
                metadata={"subject": "Alex", "start": "2024-05-01T10:30", "end": "2024-05-01T11:30"},
            ),
            TimelineEvent(
                id="task-1",
                date="2024-06-01",
                title="File taxes",
                type="task",
                metadata={"task_id": "taxes", "status": "completed"},
            ),
            TimelineEvent(
                id="task-2",
                date="2024-06-02",
                title="File taxes",
                type="task",
                metadata={"task_id": "taxes", "status": "pending"},
            ),
            TimelineEvent(
                id="turn-1",
                date="2024-07-01",
                title="Decision A",
                type="arc",
                details="Chose city life",
                metadata={"turning_point": "city-vs-country"},
            ),
            TimelineEvent(
                id="turn-2",
                date="2024-07-02",
                title="Decision B",
                type="arc",
                details="Chose country life",
                metadata={"turning_point": "city-vs-country"},
            ),
            TimelineEvent(
                id="identity-1",
                date="2024-08-01",
                title="Identity v1",
                type="identity",
                tags=["identity"],
                metadata={"subject": "Alex", "attribute": "identity_version", "value": "v1", "scope": "identity"},
            ),
            TimelineEvent(
                id="identity-2",
                date="2025-01-01",
                title="Identity v2",
                type="identity",
                tags=["identity"],
                metadata={"subject": "Alex", "attribute": "identity_version", "value": "v2", "scope": "identity"},
            ),
        ]

    def test_fact_extraction_and_registry(self):
        events = self._build_test_events()
        registry = self.engine.build_registry(events)

        birthday = registry.get("Alex", "birthday")
        self.assertIsNotNone(birthday)
        self.assertEqual("1990-01-01", birthday.value)
        self.assertGreaterEqual(birthday.confidence, 0.9)

        hometown = registry.get("Alex", "hometown")
        self.assertTrue(hometown.permanent)
        self.assertEqual("identity", hometown.scope)

        self.assertIsNotNone(registry.get("Alex", "rule:hometown"))
        self.assertGreaterEqual(len(registry.facts), 3)

    def test_conflict_detection(self):
        events = self._build_test_events()
        conflicts = detect_conflicts(self.engine.extract_facts(events), events)

        conflict_types = {c.conflict_type for c in conflicts}
        self.assertIn("factual", conflict_types)
        self.assertIn("temporal", conflict_types)
        self.assertIn("task", conflict_types)
        self.assertIn("arc", conflict_types)
        self.assertIn("identity", conflict_types)

    def test_merge_rules(self):
        avg, conf, notes = merge_numerical_drift([10, 11, 10])
        self.assertAlmostEqual(avg, 10.3333333333)
        self.assertGreater(conf, 0.7)
        self.assertTrue(notes)

        tags, conf, _ = merge_tag_drift([["a", "B"], ["b", "c"]])
        self.assertEqual(tags, ["a", "b", "c"])
        self.assertGreater(conf, 0.5)

        name, conf, _ = merge_name_drift(["Alex", "ALEX", "Alexander"])
        self.assertEqual(name, "Alex")
        self.assertGreater(conf, 0.7)

        motifs, conf, _ = merge_motif_drift(["light", "shadow", "shadow"])
        self.assertIn("shadow", motifs)
        self.assertGreater(conf, 0.6)

        relationships, _, _ = merge_relationship_drift([("Alex", "Jamie"), ("Alex", "Jamie"), ("Alex", "Kai")])
        self.assertIn(("Alex", "Jamie"), relationships)

        fragment, _, _ = merge_repeated_fragment(["short", "a longer fragment"])
        self.assertEqual(fragment, "a longer fragment")

        location, conf, _ = merge_location_fuzzy_match(["NYC", "New York", "nyc"])
        self.assertEqual(location, "Nyc")
        self.assertGreater(conf, 0.65)

    def test_drift_and_scoring(self):
        events = self._build_test_events()
        state = self.engine.analyze(events)

        # Two identity versions + conflicting birthdays should reduce score
        self.assertLess(state.score, 100)
        self.assertGreaterEqual(len(state.drift_signals), 1)
        self.assertTrue(any(signal.attribute == "identity_version" for signal in state.drift_signals))
        self.assertIn("identity", state.drift_summary)

    def test_report_rendering(self):
        events = self._build_test_events()
        state = self.engine.analyze(events)
        report = self.engine.render_report(state)

        self.assertIn("Canon Summary", report)
        self.assertIn("Conflicts Report", report)
        self.assertIn("Drift Maps", report)
        self.assertIn("Identity Continuity Overview", report)


if __name__ == "__main__":
    unittest.main()
