"""CLI entrypoint for generating the latest weekly arc."""
from __future__ import annotations

from pathlib import Path

from ..drift_auditor import DriftAuditor
from ..narrative_stitcher import NarrativeStitcher
from ..timeline_manager import TimelineManager
from .arc_engine import WeeklyArcEngine


class _FallbackTaskEngine:
    """Lightweight task engine placeholder for CLI usage."""

    def __init__(self) -> None:
        self.tasks: list[dict] = []

    def get_tasks(self, *_args, **_kwargs):  # pragma: no cover - trivial passthrough
        return list(self.tasks)


def main() -> None:
    base_path = Path(__file__).resolve().parent.parent / "timeline"
    timeline_manager = TimelineManager(base_path=base_path)
    stitcher = NarrativeStitcher()
    task_engine = _FallbackTaskEngine()
    drift_auditor = DriftAuditor()

    engine = WeeklyArcEngine(timeline_manager, stitcher, task_engine, drift_auditor)
    arc = engine.construct_week_arc()
    rendered = engine.render_arc(arc, template="default")
    print(rendered)


if __name__ == "__main__":  # pragma: no cover - CLI execution guard
    main()
