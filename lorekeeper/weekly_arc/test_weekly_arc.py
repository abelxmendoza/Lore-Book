"""Tests for the WeeklyArcEngine."""
from __future__ import annotations

import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

from ..drift_auditor import DriftAuditor
from ..event_schema import TimelineEvent
from ..narrative_stitcher import NarrativeStitcher
from ..timeline_manager import TimelineManager
from .arc_engine import WeeklyArcEngine


class FakeTaskEngine:
    def __init__(self) -> None:
        self.tasks: list[dict] = []

    def get_tasks(self, *_args, **_kwargs):
        return list(self.tasks)


class WeeklyArcEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.manager = TimelineManager(base_path=Path(self.temp_dir.name))
        self.stitcher = NarrativeStitcher(max_sections=3)
        self.task_engine = FakeTaskEngine()
        self.drift = DriftAuditor()
        self.engine = WeeklyArcEngine(self.manager, self.stitcher, self.task_engine, self.drift)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _add_event(self, **kwargs) -> TimelineEvent:
        event = TimelineEvent(**kwargs)
        return self.manager.add_event(event)

    def test_gather_week_events(self) -> None:
        self._add_event(date="2024-06-03", title="Build", type="project", details="Robot", tags=["robotics"], metadata={"device": "mac"})
        self._add_event(
            date="2024-06-07",
            title="Roll",
            type="training",
            details="BJJ",
            tags=["bjj"],
            metadata={"device": "iphone", "sentiment": "positive", "sentiment_score": 0.9},
        )
        self._add_event(date="2024-05-30", title="Old", type="note", details="Past", tags=["misc"])

        summary = self.engine.gather_week_events(start_date="2024-06-03", end_date="2024-06-09")
        self.assertEqual(summary["stats"]["count"], 2)
        self.assertEqual(summary["stats"]["devices"].get("iphone"), 1)
        self.assertIn("sentiment_summary", summary["stats"])
        self.assertEqual(summary["stats"]["categories"].get("bjj"), 1)

    def test_summarize_week_tasks(self) -> None:
        self.task_engine.tasks = [
            {"title": "Ship", "status": "completed", "priority": "high"},
            {"title": "File", "status": "overdue", "priority": "high"},
            {"title": "Plan", "status": "new", "priority": "low"},
        ]
        summary = self.engine.summarize_week_tasks(start_date=date(2024, 6, 3))
        self.assertEqual(len(summary["completed"]), 1)
        self.assertEqual(len(summary["overdue"]), 1)
        self.assertGreater(summary["efficiency_score"], 0)

    def test_generate_week_narrative(self) -> None:
        events = [
            self._add_event(date="2024-06-03", title="Build", type="project", details="Robot", tags=["robotics"]),
            self._add_event(date="2024-06-04", title="Train", type="training", details="BJJ", tags=["bjj"]),
        ]
        narrative = self.engine.generate_week_narrative(events)
        self.assertIn("Build", narrative["hook"])
        self.assertIn("Stitched", narrative["arc"])
        self.assertIsInstance(narrative["subplots"], list)

    def test_run_weekly_drift_audit(self) -> None:
        events = [
            TimelineEvent(date="2024-06-03", title="Comp", type="milestone", details="Win"),
            TimelineEvent(date="2024-06-03", title="Comp", type="milestone", details="Loss"),
        ]
        audit = self.engine.run_weekly_drift_audit(events=events)
        self.assertEqual(audit["severity"], "high")
        self.assertTrue(audit["issues"])

    def test_construct_week_arc(self) -> None:
        self._add_event(date="2024-06-03", title="Build", type="project", details="Robot", tags=["robotics"])
        self._add_event(date="2024-06-04", title="Train", type="training", details="BJJ", tags=["bjj"])
        arc = self.engine.construct_week_arc(start_date="2024-06-03", end_date="2024-06-09")
        self.assertIn("narrative", arc)
        self.assertIn("drift", arc)
        self.assertTrue(arc["themes"])
        self.assertTrue(arc["epics"])

    def test_render_arc_markdown(self) -> None:
        self._add_event(date="2024-06-03", title="Build", type="project", details="Robot", tags=["robotics"])
        arc = self.engine.construct_week_arc(start_date="2024-06-03", end_date="2024-06-09")
        md = self.engine.render_arc(arc, template="default")
        self.assertIn("Weekly Arc", md)
        self.assertIn("📌 Tasks Summary", md)


if __name__ == "__main__":
    unittest.main()
