"""Command line interface for the AutopilotEngine."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict

from .autopilot_engine import AutopilotEngine
from .event_schema import TimelineEvent


class _MockInsightEngine:
    """Lightweight stand-in so the engine can run standalone."""

    def summarize(self, _data: Any) -> str:
        return "No external insights available; using autopilot heuristics."


def _load_payload(args: argparse.Namespace) -> Dict[str, Any]:
    if args.input:
        with open(args.input, "r", encoding="utf-8") as handle:
            return json.load(handle)

    if not sys.stdin.isatty():
        raw = sys.stdin.read().strip()
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                pass

    return {
        "timeline": [
            TimelineEvent(date="2024-05-01", title="Deep work block", tags=["focus", "build"], metadata={"hour": 9}).__dict__,
            TimelineEvent(date="2024-05-08", title="Skill practice", tags=["practice", "skill"], metadata={"hour": 9}).__dict__,
        ],
        "tasks": [
            {"title": "Ship autopilot draft", "priority": 7, "due_date": "2024-05-02", "status": "incomplete", "category": "build"},
            {"title": "Recovery", "priority": 4, "due_date": "2024-05-05", "status": "complete", "category": "health"},
        ],
        "identity": {"motifs": ["build", "practice"], "emotional_slope": 0.35},
        "arcs": {"current_phase": "momentum", "previous_phase": "stabilize"},
    }


def _engine_from_payload(payload: Dict[str, Any]) -> AutopilotEngine:
    insight = _MockInsightEngine()
    return AutopilotEngine(
        insight,
        payload.get("timeline", []),
        payload.get("tasks", []),
        payload.get("identity", {}),
        payload.get("arcs", {}),
    )


def run_cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AutopilotEngine CLI")
    parser.add_argument("command", choices=["daily", "weekly", "monthly", "transition", "alerts", "momentum"], help="Autopilot command")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    parser.add_argument("--input", help="Optional JSON payload file")
    args = parser.parse_args(argv)

    payload = _load_payload(args)
    engine = _engine_from_payload(payload)

    if args.command == "daily":
        output = engine.generate_daily_plan()
        result = {"daily_plan": output.__dict__}
    elif args.command == "weekly":
        output = engine.generate_weekly_strategy()
        result = {"weekly_strategy": output.__dict__}
    elif args.command == "monthly":
        output = engine.generate_monthly_course_correction()
        result = {"monthly_correction": output.__dict__}
    elif args.command == "transition":
        output = engine.generate_arc_transition_guidance()
        result = {"arc_transition": output.__dict__}
    elif args.command == "alerts":
        result = {
            "alerts": {
                "burnout": engine.detect_burnout_risk().__dict__,
                "slump": engine.detect_slump_cycles().__dict__,
                "focus_window": engine.detect_focus_windows().__dict__,
            }
        }
    elif args.command == "momentum":
        output = engine.detect_skill_momentum()
        result = {"momentum": output.__dict__}
    else:
        result = {}

    if args.format == "markdown":
        print(engine.render_markdown())
    else:
        print(json.dumps(result, default=str))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run_cli())
