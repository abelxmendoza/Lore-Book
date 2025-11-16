"""Primary onboarding orchestrator for LoreKeeper.

The engine coordinates first-time setup, import flows, and initial guidance.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from lorekeeper.event_schema import TimelineEvent


@dataclass
class OnboardingQuestion:
    prompt: str
    key: str


class OnboardingEngine:
    def __init__(self, timeline_manager, identity_engine, season_engine, saga_engine):
        self.timeline_manager = timeline_manager
        self.identity_engine = identity_engine
        self.season_engine = season_engine
        self.saga_engine = saga_engine

    def create_user_bootstrap_profile(self, user_name: str | None = None) -> dict[str, Any]:
        """Generate starting artifacts for a new user.

        Returns a summary payload describing what was created so the caller can
        render UI or follow-on actions.
        """

        today = datetime.utcnow().date().isoformat()
        display_name = user_name or "Archivist"

        intro_event = TimelineEvent(
            date=today,
            title="Welcome to LoreKeeper",
            type="onboarding",
            details=f"{display_name} started LoreKeeper onboarding.",
            tags=["onboarding", "started_lorekeeper", "new_user"],
            source="system",
            metadata={"chapter": "Welcome", "category": "intro"},
        )

        origin_event = TimelineEvent(
            date=today,
            title="Origin moment captured",
            type="origin",
            details="Documented the initial state of your life archive.",
            tags=["onboarding", "origin", "identity"],
            source="system",
            metadata={"chapter": "Welcome"},
        )

        chapter_event = TimelineEvent(
            date=today,
            title="Book Zero: Prologue created",
            type="chapter",
            details="Established the Welcome chapter for early memories.",
            tags=["onboarding", "chapter", "prologue"],
            source="system",
            metadata={"chapter": "Welcome"},
        )

        created_events = [intro_event, origin_event, chapter_event]
        for event in created_events:
            self.timeline_manager.add_event(event)

        if hasattr(self.identity_engine, "record_baseline"):
            self.identity_engine.record_baseline(
                {
                    "created_at": today,
                    "tags": ["onboarding", "new_user", "origin"],
                    "origin": origin_event.details,
                }
            )

        return {
            "events": created_events,
            "tags": {"onboarding", "started_lorekeeper", "new_user"},
            "welcome_chapter": "Welcome",
        }

    def ask_onboarding_questions(self, responses: Optional[dict[str, str]] = None) -> dict[str, Any]:
        """Capture answers to onboarding prompts and push them to the timeline.

        The responses are stored as timeline events and forwarded to the
        identity engine when available.
        """

        questions = [
            OnboardingQuestion(prompt="What got you here?", key="motivation"),
            OnboardingQuestion(prompt="What do you want LoreKeeper to track?", key="tracking"),
            OnboardingQuestion(prompt="What major arcs define your life so far?", key="arcs"),
            OnboardingQuestion(prompt="Who are the important characters in your life?", key="characters"),
        ]

        today = datetime.utcnow().date().isoformat()
        captured: dict[str, str] = {}
        responses = responses or {}

        for question in questions:
            answer = responses.get(question.key, "")
            captured[question.key] = answer
            event = TimelineEvent(
                date=today,
                title=f"Onboarding question: {question.prompt}",
                type="onboarding_question",
                details=answer or "(no answer provided)",
                tags=["onboarding", "identity", question.key],
                source="user_entry" if answer else "system",
            )
            self.timeline_manager.add_event(event)

        if hasattr(self.identity_engine, "update_from_onboarding"):
            self.identity_engine.update_from_onboarding(captured)

        return {"questions": questions, "responses": captured}

    def generate_first_week_briefing(self) -> dict[str, Any]:
        """Summarize what LoreKeeper learned in the first week."""

        today = datetime.utcnow().date()
        week_ago = today - timedelta(days=7)
        events = self.timeline_manager.get_events(
            start_date=week_ago.isoformat(), end_date=today.isoformat()
        )

        tags: dict[str, int] = {}
        for event in events:
            for tag in getattr(event, "tags", []):
                tags[tag] = tags.get(tag, 0) + 1

        themes = sorted(tags, key=tags.get, reverse=True)[:5]
        briefing = {
            "identity_baseline": getattr(self.identity_engine, "baseline", {}),
            "early_themes": themes,
            "observations": [event.title for event in events[:10]],
            "suggestions": [
                "Add a few goals for the month",
                "Tag important people to strengthen the graph",
                "Schedule weekly reflections",
            ],
            "recommended_workflows": [
                "Use the import wizard to backfill past notes",
                "Enable calendar/photo sync for automatic context",
                "Run a weekly briefing to track shifts",
            ],
        }

        return briefing

    def build_onboarding_story(self) -> str:
        """Construct a narrative prologue from onboarding events."""

        events = self.timeline_manager.get_events(tags=["onboarding"])
        sections: list[str] = ["Book Zero: Prologue"]
        for event in events:
            sections.append(f"- [{event.date}] {event.title}: {event.details}")
        return "\n".join(sections)

    def seed_if_empty(self) -> Optional[List[TimelineEvent]]:
        """Inject sample data when the user has not imported anything."""

        from .sample_data import (
            generate_sample_characters,
            generate_sample_journal_entries,
            generate_sample_tasks,
        )

        existing = self.timeline_manager.get_events()
        if len(existing) >= 3:
            return None

        sample_events = generate_sample_journal_entries(self.timeline_manager)
        generate_sample_tasks(self.timeline_manager)
        generate_sample_characters(self.timeline_manager)
        return sample_events

    def log_import(self, entries: Iterable[TimelineEvent], source: str = "import") -> None:
        """Record a summary event noting an import operation."""

        event = TimelineEvent(
            date=datetime.utcnow().date().isoformat(),
            title="Imported onboarding memories",
            type="import",
            details=f"{len(list(entries))} entries ingested from {source}.",
            tags=["onboarding", "import"],
            source="system",
            metadata={"import_source": source},
        )
        self.timeline_manager.add_event(event)
