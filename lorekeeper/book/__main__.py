from __future__ import annotations

import argparse
from pathlib import Path

from ..timeline_manager import TimelineManager
from .book_engine import BookEngine
from .book_export import export_book_json, export_book_md


class _DemoSagaEngine:
    def generate_sagas(self):
        return [
            {
                "title": "Omega Genesis",
                "hook": "Building the first prototype sparks a chain reaction.",
                "themes": ["Robotics", "Persistence"],
                "conflicts": ["resource constraints", "time pressure"],
                "seasons": [
                    {"label": "Winter Lab", "summary": "Late nights in the garage", "subchapters": []},
                    {"label": "Spring Mats", "summary": "Growth through training", "subchapters": []},
                ],
            }
        ]


class _DemoSeasonEngine:
    def construct_season(self):
        return {"label": "Demo Season", "summary": "Placeholder season narrative"}


class _DemoIdentityEngine:
    def generate_title(self):
        return "LoreKeeper Demo Autobiography"

    def generate_subtitle(self):
        return "Snapshot from the CLI"

    @property
    def characters(self):
        return [
            {
                "id": "hero",
                "name": "The Builder",
                "bio": "Curious, relentless hacker of reality",
                "significance": "Narrator",
            }
        ]

    def build_identity_arcs(self, saga=None):
        return [{"transition": "From tinkerer to practitioner"}]


class _DemoTimelineManager(TimelineManager):
    def __init__(self):
        super().__init__(base_path=Path("/tmp/lorekeeper-demo"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a LoreKeeper autobiography artifact.")
    parser.add_argument("--format", choices=["md", "json"], default="md", help="Output format")
    args = parser.parse_args()

    timeline_manager = _DemoTimelineManager()
    engine = BookEngine(_DemoSeasonEngine(), _DemoSagaEngine(), _DemoIdentityEngine(), timeline_manager)
    book = engine.build_book_structure()

    if args.format == "json":
        print(export_book_json(book))
    else:
        print(export_book_md(book))


if __name__ == "__main__":
    main()
