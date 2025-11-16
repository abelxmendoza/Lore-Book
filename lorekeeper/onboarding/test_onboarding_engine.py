"""Tests for onboarding engine and helpers."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from lorekeeper.timeline_manager import TimelineManager
from lorekeeper.onboarding.onboarding_engine import OnboardingEngine
from lorekeeper.onboarding import import_handlers, sample_data, onboarding_templates


class _IdentityStub:
    def __init__(self) -> None:
        self.baseline = {}
        self.captured = None

    def record_baseline(self, payload):
        self.baseline = payload

    def update_from_onboarding(self, payload):
        self.captured = payload


class _NoopEngine:
    pass


class OnboardingEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.manager = TimelineManager(base_path=Path(self.tmp.name))
        self.identity = _IdentityStub()
        self.engine = OnboardingEngine(
            timeline_manager=self.manager,
            identity_engine=self.identity,
            season_engine=_NoopEngine(),
            saga_engine=_NoopEngine(),
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_bootstrap_profile_creates_events(self):
        result = self.engine.create_user_bootstrap_profile("Tester")
        events = self.manager.get_events()
        self.assertGreaterEqual(len(events), 3)
        self.assertIn("started_lorekeeper", events[0].tags)
        self.assertEqual(result["welcome_chapter"], "Welcome")
        self.assertIn("origin", self.identity.baseline["tags"])

    def test_import_handlers_capture_events(self):
        text_entries = import_handlers.import_text_dump(self.manager, "First note\n\nSecond")
        md_entries = import_handlers.import_markdown_files(self.manager, {"note.md": "# Title"})
        json_entries = import_handlers.import_json_export(
            self.manager, [{"title": "Old", "content": "Legacy", "tags": ["memory"]}]
        )
        calendar_entries = import_handlers.import_calendar(
            self.manager, [{"title": "Standup", "start": datetime.utcnow().date().isoformat()}]
        )
        photo_entries = import_handlers.import_photo_metadata(self.manager, [{"title": "Sunset"}])

        for collection in [text_entries, md_entries, json_entries, calendar_entries, photo_entries]:
            self.assertTrue(collection)
            for event in collection:
                self.assertIn("imported", event.tags)

    def test_sample_data_seed(self):
        samples = sample_data.generate_sample_journal_entries(self.manager)
        sample_data.generate_sample_tasks(self.manager)
        sample_data.generate_sample_characters(self.manager)
        self.assertGreaterEqual(len(samples), 3)
        self.assertTrue(all("sample" in event.tags for event in self.manager.get_events()))

    def test_first_week_briefing_and_templates(self):
        self.engine.create_user_bootstrap_profile("Tester")
        briefing = self.engine.generate_first_week_briefing()
        self.assertIn("early_themes", briefing)
        md = onboarding_templates.markdown_onboarding_summary(briefing)
        mobile = onboarding_templates.compressed_mobile_summary(briefing)
        export = onboarding_templates.json_onboarding_export(briefing)
        self.assertIn("Welcome to LoreKeeper", md)
        self.assertIn("Themes:", mobile)
        self.assertIn("early_themes", export)

    def test_onboarding_questions_and_story(self):
        responses = {"motivation": "Organize", "tracking": "Health"}
        self.engine.ask_onboarding_questions(responses)
        story = self.engine.build_onboarding_story()
        self.assertIn("Book Zero", story)
        self.assertEqual(self.identity.captured["motivation"], "Organize")


if __name__ == "__main__":
    unittest.main()
