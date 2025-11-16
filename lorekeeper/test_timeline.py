"""End-to-end tests for LoreKeeper timeline management."""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from .agent_timeline_interface import TimelineAgentInterface
from .event_schema import TimelineEvent
from .timeline_manager import TimelineManager


class TimelineManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.base_path = Path(self.temp_dir.name)
        self.manager = TimelineManager(base_path=self.base_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_add_and_load_event(self) -> None:
        event = TimelineEvent(
            date="2025-02-14",
            title="Earned BJJ Blue Belt",
            type="milestone",
            details="Promoted by Master Felipe Fogolin at Triunfo.",
            tags=["bjj", "martial_arts", "belt"],
            source="user_entry",
        )
        self.manager.add_event(event)
        events = self.manager.load_year(2025)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].title, event.title)

    def test_filter_by_tag_and_date(self) -> None:
        events = [
            TimelineEvent(date="2024-01-01", title="New Year", type="milestone", details="NY Day", tags=["holiday"]),
            TimelineEvent(date="2024-06-10", title="Tournament", type="martial_arts", details="BJJ comp", tags=["bjj"]),
            TimelineEvent(date="2024-12-25", title="Christmas", type="holiday", details="Xmas", tags=["holiday"]),
        ]
        for event in events:
            self.manager.add_event(event)

        filtered = self.manager.get_events(start_date="2024-06-01", end_date="2024-12-31", tags=["holiday"])
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0].title, "Christmas")

    def test_archive_and_correction(self) -> None:
        event = TimelineEvent(date="2025-03-01", title="Old Detail", type="note", details="Wrong info")
        stored = self.manager.add_event(event)
        corrected = TimelineEvent(
            date="2025-03-01",
            title="Correct Detail",
            type="note",
            details="Fixed info",
            tags=["correction"],
        )
        result = self.manager.correct_event(stored.id, corrected)
        self.assertIsNotNone(result)
        archived = self.manager.get_events(tags=["correction"], include_archived=True)
        self.assertEqual(len(archived), 1)
        archived_original = self.manager.get_events(include_archived=True)
        originals = [e for e in archived_original if e.title == "Old Detail"]
        self.assertTrue(originals[0].archived)

    def test_agent_interface_add_and_verify(self) -> None:
        agent = TimelineAgentInterface(base_path=self.base_path, max_context_events=5)
        agent.add_event_from_text("Rolled with team", date="2024-05-01", tags=["bjj"], event_type="training")
        agent.add_event_from_text("Built new robot arm", date="2024-05-02", tags=["robotics"], event_type="project")
        facts = agent.verify_facts("robot", tags=["robotics"])
        self.assertEqual(len(facts), 1)
        self.assertIn("robot", facts[0].details)

    def test_context_limit(self) -> None:
        agent = TimelineAgentInterface(base_path=self.base_path, max_context_events=3)
        base_date = datetime(2024, 1, 1)
        for offset in range(5):
            day = base_date + timedelta(days=offset)
            agent.add_event_from_text(
                f"Entry {offset}",
                date=day.date().isoformat(),
                event_type="note",
            )
        context = agent.load_timeline_context()
        self.assertEqual(len(context), 3)
        self.assertEqual(context[0]["title"], "Entry 4")


if __name__ == "__main__":
    unittest.main()
