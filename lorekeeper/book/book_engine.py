"""BookEngine builds an autobiographical book from sagas, seasons, and identity arcs."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, is_dataclass
from typing import Any, Iterable


class BookEngine:
    def __init__(self, season_engine, saga_engine, identity_engine, timeline_manager):
        self.season_engine = season_engine
        self.saga_engine = saga_engine
        self.identity_engine = identity_engine
        self.timeline_manager = timeline_manager

    # Helpers
    def _call_engine(self, engine: Any, method_names: Iterable[str], default: Any = None, *args, **kwargs) -> Any:
        for name in method_names:
            attr = getattr(engine, name, None)
            if callable(attr):
                return attr(*args, **kwargs)
            if attr is not None:
                return attr
        return default

    def _serialize(self, value: Any) -> Any:
        if is_dataclass(value):
            return asdict(value)
        if isinstance(value, list):
            return [self._serialize(item) for item in value]
        if isinstance(value, dict):
            return {key: self._serialize(val) for key, val in value.items()}
        return value

    # Builders
    def build_book_structure(self) -> dict[str, Any]:
        sagas = self._call_engine(self.saga_engine, ["construct_sagas", "generate_sagas", "get_sagas", "sagas"], default=[]) or []
        chapters = [self.build_chapter_for_saga(saga) for saga in sagas]

        metadata = self._build_metadata(sagas)
        table_of_contents = self._build_table_of_contents(chapters)
        character_compendium = self.build_character_pages()
        location_index = self.build_location_index()
        turning_points = self.build_turning_points()
        visual_prompts = self.generate_illustration_prompts(chapters)

        closing_reflections = {
            "summary": f"Looking back across {len(chapters)} chapters, the throughline of identity emerges.",
            "gratitude": "Grateful for every teacher, training partner, and collaborator along the way.",
        }

        return {
            "metadata": metadata,
            "table_of_contents": table_of_contents,
            "chapters": chapters,
            "character_compendium": character_compendium,
            "location_index": location_index,
            "turning_points": turning_points,
            "visual_prompts": visual_prompts,
            "closing_reflections": closing_reflections,
        }

    def build_chapter_for_saga(self, saga: dict[str, Any]) -> dict[str, Any]:
        saga_title = saga.get("title") or saga.get("name") or "Untitled Saga"
        saga_themes = list({theme for theme in saga.get("themes", []) if theme})
        saga_conflicts = saga.get("conflicts") or []

        identity_arcs = self._call_engine(
            self.identity_engine,
            ["build_identity_arcs", "generate_identity_arcs", "identity_arcs"],
            default=[],
            saga=saga,
        )
        identity_transitions = [arc.get("transition") or arc for arc in identity_arcs]

        seasons = saga.get("seasons") or []
        if not seasons and hasattr(self.season_engine, "construct_season"):
            constructed = self.season_engine.construct_season()
            seasons = constructed.get("months") or constructed.get("seasons") or [constructed]

        season_breakdowns: list[dict[str, Any]] = []
        for season in seasons:
            season_breakdowns.append(
                {
                    "label": season.get("label") or season.get("season_label") or season.get("month") or "Season",
                    "summary": season.get("summary") or season.get("narrative", {}).get("opening") if isinstance(season, dict) else str(season),
                    "subchapters": season.get("subchapters") or season.get("months") or [],
                }
            )

        hook = saga.get("hook") or self._call_engine(self.identity_engine, ["craft_hook", "generate_hook"], default=None, saga=saga)
        if not hook and saga_title:
            hook = f"In {saga_title}, identity collides with ambition."

        emotions = saga.get("emotions") or ["hope", "tension"]
        relationships = saga.get("relationships") or saga.get("allies") or []

        return {
            "title": saga_title,
            "hook": hook,
            "conflicts": saga_conflicts,
            "themes": saga_themes,
            "season_breakdowns": season_breakdowns,
            "emotions": emotions,
            "relationships": relationships,
            "identity_transitions": identity_transitions,
        }

    def build_character_pages(self) -> list[dict[str, Any]]:
        characters = self._call_engine(
            self.identity_engine,
            ["characters", "build_character_roster", "generate_character_roster", "get_characters"],
            default=[],
        ) or []

        events = self.timeline_manager.get_events() if hasattr(self.timeline_manager, "get_events") else []
        events_by_character: defaultdict[str, list[Any]] = defaultdict(list)
        for event in events:
            for cid in (getattr(event, "metadata", {}) or {}).get("characters", []):
                events_by_character[str(cid)].append(event)

        character_pages: list[dict[str, Any]] = []
        for character in characters:
            cid = str(character.get("id") or character.get("name") or len(character_pages))
            moments = sorted(events_by_character.get(cid, []), key=lambda e: getattr(e, "date", ""))
            first_appearance = moments[0].date if moments else None
            last_appearance = moments[-1].date if moments else None

            page = {
                "id": cid,
                "name": character.get("name", "Unknown"),
                "bio": character.get("bio", ""),
                "significance": character.get("significance", ""),
                "shared_memories": character.get("shared_memories", []),
                "relationships": character.get("relationships", []),
                "arcs": character.get("arcs", []),
                "first_appearance": first_appearance,
                "last_appearance": last_appearance,
            }
            character_pages.append(page)
        return character_pages

    def build_location_index(self) -> list[dict[str, Any]]:
        events = self.timeline_manager.get_events() if hasattr(self.timeline_manager, "get_events") else []
        locations: defaultdict[str, list[Any]] = defaultdict(list)
        for event in events:
            metadata = getattr(event, "metadata", {}) or {}
            location = metadata.get("location") or metadata.get("place")
            if location:
                locations[str(location)].append(event)

        location_index: list[dict[str, Any]] = []
        for name, loc_events in locations.items():
            sorted_events = sorted(loc_events, key=lambda e: getattr(e, "date", ""))
            location_index.append(
                {
                    "name": name,
                    "first_seen": sorted_events[0].date if sorted_events else None,
                    "last_seen": sorted_events[-1].date if sorted_events else None,
                    "event_count": len(sorted_events),
                }
            )
        return sorted(location_index, key=lambda entry: entry["name"])

    def build_turning_points(self) -> list[dict[str, Any]]:
        identity_shifts = self._call_engine(self.identity_engine, ["turning_points", "identity_shifts"], default=[]) or []
        saga_clusters = self._call_engine(self.saga_engine, ["turning_points", "event_clusters"], default=[]) or []
        events = self.timeline_manager.get_events() if hasattr(self.timeline_manager, "get_events") else []

        # basic categorization
        major_events: list[dict[str, Any]] = []
        for event in events:
            tags = {tag.lower() for tag in getattr(event, "tags", [])}
            if tags & {"robotics", "bjj", "career", "heartbreak", "triumph"}:
                major_events.append({"title": event.title, "date": event.date, "tags": list(tags)})

        return [
            {"type": "identity", "entries": identity_shifts},
            {"type": "saga", "entries": saga_clusters},
            {"type": "events", "entries": major_events},
        ]

    def generate_illustration_prompts(self, chapters: Iterable[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
        prompts: list[dict[str, Any]] = []
        for chapter in chapters or []:
            base_title = chapter.get("title", "Chapter")
            prompts.append(
                {
                    "chapter": base_title,
                    "cyberpunk_city_memory": f"{base_title}: neon skyline memory in rain.",
                    "fight_scene": f"{base_title}: kinetic martial arts encounter in alley.",
                    "robotics_lab": f"{base_title}: robotics lab breakthrough with glowing schematics.",
                    "emotional_turn": f"{base_title}: quiet moment of doubt before transformation.",
                    "daily_grind": f"{base_title}: montage of relentless daily practice.",
                    "identity_metamorphosis": f"{base_title}: self fragments reshaping into new form.",
                }
            )
        return prompts

    # Internal methods
    def _build_metadata(self, sagas: list[dict[str, Any]]) -> dict[str, Any]:
        title = self._call_engine(self.identity_engine, ["generate_title", "title"], default="Autobiography of a Tinkerer")
        subtitle = self._call_engine(self.identity_engine, ["generate_subtitle", "subtitle"], default="Seasons of Becoming")
        preface = (
            f"This volume threads together {len(sagas)} sagas, seasons of growth, and identity arcs "
            "captured by the LoreKeeper system."
        )
        return {"title": title, "subtitle": subtitle, "preface": preface}

    def _build_table_of_contents(self, chapters: list[dict[str, Any]]) -> list[dict[str, Any]]:
        toc: list[dict[str, Any]] = []
        for idx, chapter in enumerate(chapters, start=1):
            subchapters = [
                breakdown.get("label", "") for breakdown in chapter.get("season_breakdowns", []) if breakdown.get("label")
            ]
            toc.append({"number": idx, "title": chapter.get("title", "Chapter"), "subchapters": subchapters})
        return toc
