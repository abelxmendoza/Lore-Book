"""Integration pipeline for GitHub and Instagram distillation."""
from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from lorekeeper.distillers.github import GithubDistiller, GithubMilestone
from lorekeeper.distillers.instagram import InstagramDistiller
from lorekeeper.event_schema import TimelineEvent
from lorekeeper.timeline_manager import TimelineManager

INBOX_ROOT = Path(__file__).resolve().parent.parent / "inbox"


def _read_jsonl(path: Path) -> List[dict]:
    if not path.exists():
        return []
    content = path.read_text(encoding="utf-8")
    return [json.loads(line) for line in content.splitlines() if line.strip()]


def read_inbox(source: str, user_id: str | None = None) -> List[dict]:
    inbox_file = INBOX_ROOT / source / "raw_events.jsonl"
    return _read_jsonl(inbox_file)


def _github_events(raw_events: List[dict]) -> List[GithubMilestone]:
    return GithubDistiller().distill(raw_events)


def _instagram_events(raw_events: List[dict]) -> List[dict]:
    return InstagramDistiller().distill(raw_events)


def get_distilled(integration: str, user_id: str | None = None):
    raw_events = read_inbox(integration, user_id)
    if integration == "github":
        distilled = [asdict(evt) for evt in _github_events(raw_events)]
    elif integration == "instagram":
        distilled = _instagram_events(raw_events)
    else:
        distilled = raw_events
    return {"distilled": distilled}


def _to_timeline_event(payload: dict, source: str) -> TimelineEvent:
    timestamp = payload.get("timestamp") or datetime.utcnow().isoformat()
    tags = payload.get("tags") or []
    title = payload.get("title") or payload.get("summary") or f"{source} event"
    return TimelineEvent(
        date=timestamp,
        title=title,
        type=source,
        details=payload.get("summary") or payload.get("description") or title,
        tags=list(tags),
        source=source,
        metadata={k: v for k, v in payload.items() if k not in {"summary", "tags"}},
    )


def run_pipeline(user_id: str) -> Dict[str, int]:
    github_raw = read_inbox("github", user_id)
    instagram_raw = read_inbox("instagram", user_id)

    github_clean = _github_events(github_raw)
    instagram_clean = _instagram_events(instagram_raw)

    manager = TimelineManager()
    for evt in github_clean:
        manager.add_event(
            _to_timeline_event(
                {
                    "title": evt.title,
                    "summary": evt.summary,
                    "timestamp": evt.timestamp,
                    "tags": evt.tags,
                    "repo": evt.repo,
                    "impact": evt.impact,
                },
                "github",
            )
        )

    for media in instagram_clean:
        manager.add_event(_to_timeline_event(media, "instagram"))

    return {"github": len(github_clean), "instagram": len(instagram_clean)}


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run integration pipeline")
    parser.add_argument("user_id", nargs="?", default="demo")
    args = parser.parse_args()
    print(json.dumps(run_pipeline(args.user_id)))
