"""Tests for the MonthlyArcEngine and templates."""
from __future__ import annotations

import unittest
from datetime import date

from ..event_schema import TimelineEvent
from .monthly_engine import MonthlyArcEngine
from .monthly_templates import compressed_md_template, default_md_template

class FakeTimelineManager:
    def __init__(self, events=None):
        self.events = events or []

    def get_events(self, start_date=None, end_date=None, include_archived=False, **_kwargs):
        filtered = []
        for event in self.events:
            if start_date and event.date < start_date:
                continue
            if end_date and event.date > end_date:
                continue
            if not include_archived and getattr(event, "archived", False):
                continue
            filtered.append(event)
        return list(filtered)


class FakeWeeklyArcEngine:
    def __init__(self):
        self.calls = []

    def construct_week_arc(self, events=None, start_date=None, end_date=None):
        self.calls.append({"events": list(events or []), "start": start_date, "end": end_date})
        return {"narrative": {"hook": "Weekly hook", "arc": f"{len(events or [])} events"}}


class FakeNarrativeStitcher:
    def stitch(self, events):
        return f"stitched-{len(events)}"


class FakeTaskEngine:
    def __init__(self):
        self.week_breakdown_called = False

    def summarize_month(self):
        return {
            "completed": ["t1", "t2"],
            "overdue": ["late"],
            "new_tasks": ["t3"],
            "priority": ["p1"],
            "efficiency_score": 0.5,
            "week_breakdowns": [["w1"], ["w2"]],
        }


class FakeDriftAuditor:
    def __init__(self, issues=None):
        self.issues = issues or []
        self.audit_calls = []

    def audit(self, events):
        self.audit_calls.append(list(events))
        return self.issues


class MonthlyArcEngineTests(unittest.TestCase):
    def setUp(self):
        self.events = [
            TimelineEvent(date="2024-01-01", title="New Year", type="celebration", tags=["celebration"], metadata={"sentiment": "positive"}),
            TimelineEvent(date="2024-01-08", title="Robotics sprint", type="work", tags=["robotics", "omega1"], metadata={"sentiment": "focused"}),
            TimelineEvent(date="2024-01-15", title="BJJ class", type="training", tags=["bjj", "training"], metadata={"tone": "tired"}),
            TimelineEvent(date="2024-01-22", title="Japanese study", type="learning", tags=["japanese"], metadata={"sentiment": "curious"}),
            TimelineEvent(date="2024-01-29", title="Finance review", type="finance", tags=["finances"], metadata={}),
        ]
        self.timeline = FakeTimelineManager(events=self.events)
        self.weekly_engine = FakeWeeklyArcEngine()
        self.stitcher = FakeNarrativeStitcher()
        self.task_engine = FakeTaskEngine()
        self.drift_auditor = FakeDriftAuditor(issues=["contradiction"])
        self.engine = MonthlyArcEngine(self.timeline, self.weekly_engine, self.stitcher, self.task_engine, self.drift_auditor)

    def test_gather_month_events_stats(self):
        result = self.engine.gather_month_events(start_date=date(2024, 1, 1), end_date=date(2024, 1, 31))
        self.assertEqual(result["stats"]["count"], 5)
        self.assertIn("celebration", result["stats"]["categories"])
        self.assertIn("robotics", result["stats"]["tags"])
        self.assertIn("positive", result["stats"]["sentiment_summary"])
        self.assertTrue(result["stats"]["week_splits"])

    def test_weekly_arc_stitching(self):
        weekly_arcs = self.engine.synthesize_weekly_arcs(start_date=date(2024, 1, 1), end_date=date(2024, 1, 31))
        self.assertGreaterEqual(len(self.weekly_engine.calls), 4)
        self.assertTrue(all("week_label" in w for w in weekly_arcs))
        self.assertTrue(any("Weekly hook" in str(w.get("arc")) for w in weekly_arcs))

    def test_task_summary(self):
        tasks = self.engine.summarize_month_tasks()
        self.assertIn("completed", tasks)
        self.assertAlmostEqual(tasks.get("efficiency_score", 0), 0.5)
        self.assertTrue(tasks.get("week_breakdowns"))

    def test_narrative_generation(self):
        weekly = self.engine.synthesize_weekly_arcs(start_date=date(2024, 1, 1), end_date=date(2024, 1, 31))
        narrative = self.engine.generate_month_narrative(events=self.events, weekly_arcs=weekly)
        self.assertIn("stitched", narrative.get("hook", ""))
        self.assertTrue(narrative.get("subplots"))
        self.assertTrue(narrative.get("turning_points"))

    def test_theme_and_epic_detection(self):
        weekly = self.engine.synthesize_weekly_arcs(start_date=date(2024, 1, 1), end_date=date(2024, 1, 31))
        themes = self.engine.infer_monthly_themes(self.events, weekly)
        self.assertTrue(any("Trending" in t for t in themes))
        epics = self.engine.detect_epic_progression(self.events)
        self.assertTrue(any(e.get("epic") == "Robotics: Omega-1" for e in epics))

    def test_arc_assembly(self):
        arc = self.engine.construct_month_arc(start_date=date(2024, 1, 1), end_date=date(2024, 1, 31))
        self.assertIn("narrative", arc)
        self.assertIn("tasks", arc)
        self.assertIn("themes", arc)
        self.assertEqual(arc["time_window"], "2024-01-01 to 2024-01-31")

    def test_markdown_rendering(self):
        arc = self.engine.construct_month_arc(start_date=date(2024, 1, 1), end_date=date(2024, 1, 31))
        md = default_md_template(arc)
        self.assertIn("Monthly Arc", md)
        compressed = compressed_md_template(arc)
        self.assertIn("🟣", compressed)


if __name__ == "__main__":
    unittest.main()
