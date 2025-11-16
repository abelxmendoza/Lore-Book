"""Tests for the BookEngine."""
from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from ..event_schema import TimelineEvent
from ..timeline_manager import TimelineManager
from .book_engine import BookEngine
from .book_export import export_book_json, export_book_md
from .book_templates import render_full_book, render_snapshot_edition


class FakeSagaEngine:
    def __init__(self):
        self.calls: list[str] = []

    def generate_sagas(self):
        self.calls.append("generate_sagas")
        return [
            {
                "title": "Omega Prototype",
                "hook": "A spark in the lab ignites a life-long pursuit.",
                "themes": ["Robotics", "Curiosity"],
                "conflicts": ["resource scarcity"],
                "seasons": [
                    {
                        "label": "Winter Build",
                        "summary": "Nightly soldering sessions forge grit.",
                        "subchapters": [{"label": "First Draft", "summary": "The frame takes shape."}],
                    }
                ],
            },
            {
                "title": "Martial Momentum",
                "themes": ["Discipline"],
                "conflicts": ["competing priorities"],
                "seasons": [],
            },
        ]


class FakeSeasonEngine:
    def __init__(self):
        self.constructed = 0

    def construct_season(self):
        self.constructed += 1
        return {
            "label": "Fallback Season",
            "summary": "Constructed season summary",
            "months": [
                {"month": "2024-01", "summary": "January grind"},
                {"month": "2024-02", "summary": "February flow"},
            ],
        }


class FakeIdentityEngine:
    def __init__(self):
        self.title_calls = 0

    def generate_title(self):
        self.title_calls += 1
        return "Chronicles of the Builder"

    def generate_subtitle(self):
        return "Arc of Becoming"

    def build_identity_arcs(self, saga=None):
        return [
            {"transition": f"{saga.get('title', 'Saga')} shifts perspective"},
            {"transition": "Doubt into determination"},
        ]

    @property
    def characters(self):
        return [
            {
                "id": "hero",
                "name": "Narrator",
                "bio": "Curious technologist",
                "significance": "Protagonist",
            },
            {
                "id": "mentor",
                "name": "Mentor",
                "bio": "Guiding force",
                "shared_memories": ["Long walks debating systems"],
            },
        ]

    @property
    def turning_points(self):
        return ["First prototype works", "Wins tournament"]


class BookEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.timeline = TimelineManager(base_path=Path(self.temp_dir.name))
        # add events to timeline for locations and characters
        event_a = TimelineEvent(
            date="2024-01-02",
            title="Garage Build",
            type="project",
            details="",
            tags=["robotics"],
            metadata={"location": "Garage", "characters": ["hero"]},
        )
        event_b = TimelineEvent(
            date="2024-02-10",
            title="Dojo Roll",
            type="training",
            details="",
            tags=["bjj"],
            metadata={"place": "Dojo", "characters": ["hero", "mentor"]},
        )
        self.timeline.add_event(event_a)
        self.timeline.add_event(event_b)

        self.saga_engine = FakeSagaEngine()
        self.season_engine = FakeSeasonEngine()
        self.identity_engine = FakeIdentityEngine()
        self.engine = BookEngine(self.season_engine, self.saga_engine, self.identity_engine, self.timeline)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_build_book_structure_links_chapters_and_toc(self) -> None:
        book = self.engine.build_book_structure()
        self.assertEqual(len(book["chapters"]), 2)
        self.assertEqual(len(book["table_of_contents"]), 2)
        self.assertEqual(book["table_of_contents"][0]["title"], "Omega Prototype")
        # ensure identity arcs present in chapter intro
        first_chapter = book["chapters"][0]
        self.assertTrue(first_chapter["identity_transitions"])

    def test_chapter_generation_uses_season_engine(self) -> None:
        saga = {"title": "Fallback", "themes": ["Growth"], "conflicts": []}
        chapter = self.engine.build_chapter_for_saga(saga)
        self.assertEqual(self.season_engine.constructed, 1)
        self.assertTrue(chapter["season_breakdowns"])

    def test_character_pages_track_appearances(self) -> None:
        pages = self.engine.build_character_pages()
        hero_page = next(page for page in pages if page["id"] == "hero")
        self.assertEqual(hero_page["first_appearance"], "2024-01-02")
        self.assertEqual(hero_page["last_appearance"], "2024-02-10")

    def test_templates_and_exporters_render(self) -> None:
        book = self.engine.build_book_structure()
        md = render_full_book(book)
        snapshot = render_snapshot_edition(book)
        self.assertIn("Table of Contents", md)
        self.assertIn("Snapshot", snapshot)
        md_export = export_book_md(book)
        json_export = export_book_json(book)
        self.assertTrue(md_export.startswith("#"))
        parsed = json.loads(json_export)
        self.assertIn("metadata", parsed)

    def test_turning_points_and_prompts_present(self) -> None:
        book = self.engine.build_book_structure()
        self.assertTrue(book["turning_points"])
        self.assertEqual(len(book["visual_prompts"]), len(book["chapters"]))


if __name__ == "__main__":
    unittest.main()
