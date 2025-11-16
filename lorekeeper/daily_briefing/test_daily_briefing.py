"""Tests for the DailyBriefingEngine and templates."""
from __future__ import annotations

import unittest
from datetime import date

from ..event_schema import TimelineEvent
from .briefing_engine import DailyBriefingEngine
from .briefing_templates import compressed_md_template, default_md_template


class FakeTimelineManager:
    def __init__(self, period_map=None, events=None):
        self.period_map = period_map or {}
        self.events = events or []

    def get_events_by_period(self, period, reference_date=None, **_kwargs):
        return self.period_map.get(period, [])

    def get_events(self, **_kwargs):
        return list(self.events)


class FakeNarrativeStitcher:
    def __init__(self):
        self.calls = []

    def stitch(self, events):
        self.calls.append(list(events))
        titles = ", ".join(getattr(e, "title", "") for e in events)
        return f"stitched: {titles}" if titles else "No storyline available."


class FakeTaskEngine:
    def __init__(self, categories=None):
        self.categories = categories or {}
        self.score_called = False

    def categorize_tasks(self):
        return self.categories

    def score_tasks(self, summary):
        self.score_called = True
        return summary


class FakeDriftFlag:
    def __init__(self, issue):
        self.issue = issue


class FakeDriftAuditor:
    def __init__(self, flags=None):
        self.flags = flags or []

    def audit(self, events):
        self.events_received = events
        return self.flags


class DailyBriefingEngineTests(unittest.TestCase):
    def setUp(self):
        self.events = [
            TimelineEvent(date="2024-01-01", title="New Year", metadata={"season": "winter"}),
            TimelineEvent(date="2024-06-01", title="Launch", metadata={"season": "summer"}),
        ]
        self.period_map = {
            "last_7_days": [self.events[0]],
            "last_30_days": [self.events[0], self.events[1]],
            "last_3_months": [self.events[1]],
            "this_year": self.events,
        }
        self.timeline = FakeTimelineManager(period_map=self.period_map, events=self.events)
        self.stitcher = FakeNarrativeStitcher()
        self.task_engine = FakeTaskEngine(
            categories={
                "due_today": ["task1"],
                "due_this_week": ["task2"],
                "overdue": ["task3"],
                "completed_yesterday": ["done"],
                "priority": ["prio"],
            }
        )
        self.drift_auditor = FakeDriftAuditor(flags=[FakeDriftFlag("Conflicting recounts"), FakeDriftFlag("Missing date")])
        self.engine = DailyBriefingEngine(self.timeline, self.stitcher, self.task_engine, self.drift_auditor)

    def test_recent_activity_generation(self):
        summary = self.engine.get_recent_activity(reference_date=date(2024, 6, 2))
        self.assertIn("last_7_days", summary)
        self.assertEqual(summary["last_7_days"], [self.events[0]])
        self.assertIn("No logged activity" in summary["notes"] or "Activity density" in summary["notes"], (True, False))

    def test_task_summary_assembly(self):
        tasks = self.engine.get_task_summary()
        self.assertEqual(tasks["due_today"], ["task1"])
        self.assertTrue(self.task_engine.score_called)

    def test_narrative_stitching_integration(self):
        narrative = self.engine.build_narrative_sections(reference_date=date(2024, 6, 2))
        self.assertIn("yesterday", narrative)
        self.assertTrue(self.stitcher.calls)
        self.assertIn("stitched", narrative["year_to_date"])
        self.assertIn("summer", " ".join(narrative["seasons"].keys()))

    def test_drift_audit_passthrough(self):
        drift = self.engine.run_drift_audit()
        self.assertEqual(len(drift["contradictions"]), 1)
        self.assertEqual(len(drift["missing_dates"]), 1)
        self.assertEqual(self.drift_auditor.events_received, self.events)

    def test_briefing_creation(self):
        briefing = self.engine.create_briefing()
        self.assertIn("timestamp", briefing)
        self.assertIn("sections", briefing)
        self.assertIn("tasks", briefing["sections"])
        self.assertIn("recent_activity", briefing["sections"])

    def test_markdown_rendering(self):
        briefing = self.engine.create_briefing()
        md_output = default_md_template(briefing)
        self.assertIn("Daily Executive Briefing", md_output)
        compressed = compressed_md_template(briefing)
        self.assertIn("🟣", compressed)


if __name__ == "__main__":
    unittest.main()
