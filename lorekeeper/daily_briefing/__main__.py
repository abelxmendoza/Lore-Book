"""CLI entrypoint for generating a daily executive briefing."""
from __future__ import annotations

from ..drift_auditor import DriftAuditor
from ..narrative_stitcher import NarrativeStitcher
from ..timeline_manager import TimelineManager
from .briefing_engine import DailyBriefingEngine


class NullTaskEngine:
    """Fallback task engine to keep the CLI operational without task data."""

    def categorize_tasks(self):
        return {}

    def score_tasks(self, summary):
        return summary


def main() -> None:
    manager = TimelineManager()
    stitcher = NarrativeStitcher()
    task_engine = NullTaskEngine()
    auditor = DriftAuditor()

    engine = DailyBriefingEngine(manager, stitcher, task_engine, auditor)
    briefing_markdown = engine.render_briefing(template="default")
    print(briefing_markdown)


if __name__ == "__main__":
    main()
