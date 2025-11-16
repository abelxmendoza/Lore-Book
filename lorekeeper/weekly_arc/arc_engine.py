"""Weekly arc generation engine for LoreKeeper."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timedelta
from typing import Any, List, Optional

from ..event_schema import TimelineEvent


class WeeklyArcEngine:
    def __init__(self, timeline_manager, narrative_stitcher, task_engine, drift_auditor):
        self.timeline_manager = timeline_manager
        self.narrative_stitcher = narrative_stitcher
        self.task_engine = task_engine
        self.drift_auditor = drift_auditor

    def _coerce_date(self, value: Optional[Any]) -> Optional[date]:
        if value is None:
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value).date()
        raise TypeError("Date values must be ISO strings or datetime.date instances")

    def _resolve_week_range(self, start_date: Optional[Any] = None, end_date: Optional[Any] = None) -> tuple[date, date]:
        start = self._coerce_date(start_date)
        end = self._coerce_date(end_date)

        if start and not end:
            end = start + timedelta(days=6)
        elif end and not start:
            start = end - timedelta(days=6)

        if start is None or end is None:
            today = datetime.utcnow().date()
            week_start = getattr(self.timeline_manager, "week_start", "monday")
            normalized_start = str(week_start).lower()
            if normalized_start in {"sunday", "sun"}:
                delta = (today.weekday() + 1) % 7
            else:
                delta = today.weekday()
            start = today - timedelta(days=delta)
            end = start + timedelta(days=6)

        return start, end

    def _serialize_events(self, obj: Any) -> Any:
        if is_dataclass(obj):
            return asdict(obj)
        if isinstance(obj, TimelineEvent):
            return obj.__dict__
        if isinstance(obj, list):
            return [self._serialize_events(item) for item in obj]
        if isinstance(obj, dict):
            return {key: self._serialize_events(value) for key, value in obj.items()}
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return obj

    def gather_week_events(self, start_date: Optional[Any] = None, end_date: Optional[Any] = None) -> dict[str, Any]:
        start, end = self._resolve_week_range(start_date=start_date, end_date=end_date)
        events = self.timeline_manager.get_events(start_date=start.isoformat(), end_date=end.isoformat())

        tag_counter: Counter[str] = Counter()
        device_counter: Counter[str] = Counter()
        sentiment_counter: Counter[str] = Counter()
        sentiment_scores: List[float] = []

        for event in events:
            tag_counter.update(event.tags)
            if isinstance(event.metadata, dict):
                device = event.metadata.get("device")
                if device:
                    device_counter[device] += 1
                sentiment = event.metadata.get("sentiment")
                if sentiment:
                    sentiment_counter[str(sentiment)] += 1
                score = event.metadata.get("sentiment_score")
                if isinstance(score, (int, float)):
                    sentiment_scores.append(float(score))

        sentiment_summary: dict[str, Any] = {"counts": dict(sentiment_counter)}
        if sentiment_scores:
            sentiment_summary["average_score"] = sum(sentiment_scores) / len(sentiment_scores)

        return {
            "events": events,
            "stats": {
                "count": len(events),
                "categories": dict(tag_counter),
                "devices": dict(device_counter),
                "sentiment_summary": sentiment_summary,
            },
            "time_window": f"{start.isoformat()} to {end.isoformat()}",
        }

    def summarize_week_tasks(self, start_date: Optional[Any] = None, end_date: Optional[Any] = None) -> dict[str, Any]:
        start, end = self._resolve_week_range(start_date=start_date, end_date=end_date)

        task_fetcher = getattr(self.task_engine, "get_tasks", None)
        if callable(task_fetcher):
            tasks = task_fetcher(start.isoformat(), end.isoformat())
        else:
            tasks = getattr(self.task_engine, "tasks", [])

        def _filter_tasks(statuses: set[str]) -> List[Any]:
            return [task for task in tasks if str(task.get("status", "")).lower() in statuses]

        completed = _filter_tasks({"completed", "done"})
        overdue = _filter_tasks({"overdue", "late"})
        new_tasks = _filter_tasks({"new", "open", "created"})
        priority_tasks = [task for task in tasks if str(task.get("priority", "")).lower() in {"high", "urgent", "p1"}]

        completion_ratio = len(completed) / len(tasks) if tasks else 0.0
        priority_total = len(priority_tasks)
        priority_done = len([task for task in priority_tasks if task in completed or str(task.get("status")) == "completed"])
        priority_fulfillment = priority_done / priority_total if priority_total else 1.0
        efficiency_score = completion_ratio * priority_fulfillment

        return {
            "completed": completed,
            "overdue": overdue,
            "new_tasks": new_tasks,
            "priority": priority_tasks,
            "efficiency_score": efficiency_score,
            "time_window": f"{start.isoformat()} to {end.isoformat()}",
        }

    def generate_week_narrative(self, events: List[TimelineEvent]) -> dict[str, Any]:
        if not events:
            return {
                "hook": "A quiet week with room for new beginnings.",
                "arc": "No storyline available.",
                "subplots": [],
                "cliffhanger": "What spark will ignite next week?",
            }

        ordered_events = sorted(events, key=lambda e: e.date)
        sections = self.narrative_stitcher.segment_events(ordered_events)
        hook_event = ordered_events[0]
        hook = f"The week opened on {hook_event.date} with {hook_event.title}."

        arc_story = self.narrative_stitcher.stitch(ordered_events)
        subplots = [section.summary for section in sections[1:]]

        final_event = ordered_events[-1]
        cliffhanger = f"After {final_event.title}, the stage is set for a bold next move."

        return {
            "hook": arc_story if not hook else hook,
            "arc": arc_story,
            "subplots": subplots,
            "cliffhanger": cliffhanger,
        }

    def run_weekly_drift_audit(
        self, start_date: Optional[Any] = None, end_date: Optional[Any] = None, events: Optional[List[TimelineEvent]] = None
    ) -> dict[str, Any]:
        start, end = self._resolve_week_range(start_date=start_date, end_date=end_date)
        events_to_audit = events or self.timeline_manager.get_events(start_date=start.isoformat(), end_date=end.isoformat())
        flags = self.drift_auditor.audit(events_to_audit)

        severity_levels = {"low": 1, "medium": 2, "high": 3}
        highest = "low"
        for flag in flags:
            flag_severity = getattr(flag, "severity", "low")
            if severity_levels.get(flag_severity, 1) > severity_levels.get(highest, 1):
                highest = flag_severity

        notes = "; ".join(getattr(flag, "notes", "") for flag in flags) if flags else "No drift detected."

        return {
            "issues": flags,
            "severity": highest if flags else "low",
            "notes": notes,
            "time_window": f"{start.isoformat()} to {end.isoformat()}",
        }

    def _infer_themes(self, events: List[TimelineEvent]) -> List[str]:
        tags = Counter()
        for event in events:
            tags.update(event.tags)
        common = [tag for tag, _ in tags.most_common(5)]
        return common

    def _detect_epics(self, events: List[TimelineEvent]) -> List[str]:
        tag_clusters: defaultdict[str, List[str]] = defaultdict(list)
        for event in events:
            for tag in event.tags:
                tag_clusters[tag.lower()].append(event.title)

        epics = []
        for tag, titles in tag_clusters.items():
            if len(titles) >= 2:
                epics.append(f"{tag.title()} ({len(titles)} beats)")
            else:
                epics.append(f"{tag.title()} (spark)")
        return epics

    def construct_week_arc(self, start_date: Optional[Any] = None, end_date: Optional[Any] = None) -> dict[str, Any]:
        events_payload = self.gather_week_events(start_date=start_date, end_date=end_date)
        start, end = self._resolve_week_range(start_date=start_date, end_date=end_date)
        tasks_summary = self.summarize_week_tasks(start_date=start, end_date=end)
        narrative = self.generate_week_narrative(events_payload["events"])
        drift = self.run_weekly_drift_audit(start_date=start, end_date=end, events=events_payload["events"])

        themes = self._infer_themes(events_payload["events"])
        epics = self._detect_epics(events_payload["events"])

        return {
            "time_window": f"{start.isoformat()} to {end.isoformat()}",
            "events": events_payload,
            "tasks": tasks_summary,
            "narrative": narrative,
            "drift": drift,
            "themes": themes,
            "epics": epics,
        }

    def render_arc(self, arc: dict[str, Any], template: str = "default") -> str:
        from .arc_templates import compressed_md_template, default_md_template

        if template == "default":
            return default_md_template(arc)
        if template == "compressed":
            return compressed_md_template(arc)
        if template == "json":
            serializable = json.loads(json.dumps(arc, default=self._serialize_events))
            return json.dumps(serializable, indent=2, ensure_ascii=False)
        raise ValueError(f"Unsupported template: {template}")
