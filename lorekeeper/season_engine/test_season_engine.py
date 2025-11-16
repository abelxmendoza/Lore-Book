"""Tests for the SeasonEngine."""
from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from ..drift_auditor import DriftAuditor
from ..event_schema import TimelineEvent
from ..narrative_stitcher import NarrativeStitcher
from ..timeline_manager import TimelineManager
from .season_engine import SeasonEngine


class FakeMonthlyArcEngine:
    def __init__(self) -> None:
        self.generated: list[str] = []

    def construct_month_arc(self, month_label: str) -> dict:
        self.generated.append(month_label)
        return {
            "label": month_label,
            "tags": ["robotics", "bjj"] if month_label.endswith("01") else ["career"],
            "themes": ["Momentum"],
            "narrative": {"hook": f"Hook for {month_label}"},
        }


class SeasonEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.timeline = TimelineManager(base_path=Path(self.temp_dir.name))
        self.stitcher = NarrativeStitcher(max_sections=3)
        self.drift = DriftAuditor()
        self.monthly = FakeMonthlyArcEngine()
        self.engine = SeasonEngine(
            monthly_arc_engine=self.monthly,
            timeline_manager=self.timeline,
            narrative_stitcher=self.stitcher,
            task_engine=None,
            drift_auditor=self.drift,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _add_event(self, **kwargs) -> TimelineEvent:
        event = TimelineEvent(**kwargs)
        return self.timeline.add_event(event)

    def test_gather_season_range_infers_months(self) -> None:
        self._add_event(date="2024-01-15", title="Build", type="project", details="Omega", tags=["robotics", "season_start"], metadata={"sentiment": "positive", "sentiment_score": 0.8})
        self._add_event(date="2024-02-03", title="Roll", type="training", details="BJJ", tags=["bjj"], metadata={"sentiment": "positive"})
        summary = self.engine.gather_season_range()
        self.assertIn("2024-01", summary["months"])
        self.assertIn("tag_distribution", summary["stats"])
        self.assertEqual(len(summary["monthly_arcs"]), len(summary["months"]))

    def test_load_monthly_arcs_tracks_calls(self) -> None:
        months = ["2024-01", "2024-02"]
        arcs = self.engine.load_monthly_arcs(months)
        self.assertEqual(len(arcs), 2)
        self.assertEqual(self.monthly.generated, months)

    def test_detects_themes_and_epics(self) -> None:
        events = [
            TimelineEvent(date="2024-01-01", title="Robot", type="project", details="", tags=["robotics"]),
            TimelineEvent(date="2024-02-01", title="Roll", type="training", details="", tags=["bjj"]),
        ]
        monthly_arcs = self.engine.load_monthly_arcs(["2024-01"])
        themes = self.engine.detect_season_themes(monthly_arcs, events)
        epics = self.engine.detect_epic_arcs(events, monthly_arcs)
        self.assertTrue(any("Robotics" in theme for theme in themes))
        self.assertTrue(any(epic.get("epic") for epic in epics))

    def test_generates_narrative(self) -> None:
        monthly_arcs = self.engine.load_monthly_arcs(["2024-01", "2024-02"])
        themes = ["Growth", "Robotics"]
        epics = [{"epic": "Robotics: Omega-1 Genesis", "phases": ["Definition"], "key_milestones": ["Built"]}]
        narrative = self.engine.generate_season_narrative(monthly_arcs, themes, epics)
        self.assertIn("opening", narrative)
        self.assertIn("main_arc", narrative)
        self.assertTrue(narrative["subplots"])

    def test_construct_season(self) -> None:
        self._add_event(date="2024-01-15", title="Build", type="project", details="Omega", tags=["robotics", "season_start"])
        self._add_event(date="2024-02-03", title="Roll", type="training", details="BJJ", tags=["bjj"])
        season = self.engine.construct_season()
        self.assertIn("narrative", season)
        self.assertIn("epics", season)
        self.assertTrue(season["months"])

    def test_render_season_markdown(self) -> None:
        self._add_event(date="2024-01-15", title="Build", type="project", details="Omega", tags=["robotics", "season_start"])
        season = self.engine.construct_season()
        md = self.engine.render_season(season, template="default")
        compressed = self.engine.render_season(season, template="compressed")
        self.assertIn("Season", md)
        self.assertIn("Themes", compressed)
        json_payload = self.engine.render_season(season, template="json")
        self.assertIn("season_label", json_payload)


if __name__ == "__main__":
    unittest.main()
