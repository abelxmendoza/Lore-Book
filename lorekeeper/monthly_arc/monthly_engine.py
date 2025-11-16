"""Monthly Arc Engine for constructing 30-day narrative arcs."""
from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ..event_schema import TimelineEvent


class MonthlyArcEngine:
    """Compose and render monthly arcs from timeline, tasks, and narrative systems."""

    def __init__(self, timeline_manager, weekly_arc_engine, narrative_stitcher, task_engine, drift_auditor):
        self.timeline_manager = timeline_manager
        self.weekly_arc_engine = weekly_arc_engine
        self.narrative_stitcher = narrative_stitcher
        self.task_engine = task_engine
        self.drift_auditor = drift_auditor

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _normalize_date(self, value: Optional[date | datetime | str]) -> date:
        if value is None:
            return datetime.now(UTC).date()
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return datetime.fromisoformat(str(value)).date()

    def _resolve_month_range(self, start_date: Optional[date | datetime | str] = None, end_date: Optional[date | datetime | str] = None) -> Tuple[date, date]:
        if start_date is None and end_date is None:
            today = datetime.now(UTC).date()
            start = date(year=today.year, month=today.month, day=1)
            if today.month == 12:
                next_month = date(year=today.year + 1, month=1, day=1)
            else:
                next_month = date(year=today.year, month=today.month + 1, day=1)
            end = next_month - timedelta(days=1)
            return start, end

        start = self._normalize_date(start_date) if start_date else None
        end = self._normalize_date(end_date) if end_date else None

        if start and not end:
            # assume 30-day span
            end = start + timedelta(days=30)
        elif end and not start:
            start = end - timedelta(days=30)

        if start is None or end is None:
            today = datetime.now(UTC).date()
            return today - timedelta(days=30), today

        if start > end:
            start, end = end, start

        return start, end

    def _week_ranges(self, start: date, end: date, events: Sequence[TimelineEvent]) -> List[Tuple[str, date, date, List[TimelineEvent]]]:
        weeks: List[Tuple[str, date, date, List[TimelineEvent]]] = []
        cursor = start
        week_index = 1
        while cursor <= end:
            week_end = min(cursor + timedelta(days=6), end)
            events_in_week = [
                event
                for event in events
                if cursor.isoformat() <= getattr(event, "date", "") <= week_end.isoformat()
            ]
            label = f"Week {week_index} ({cursor.isoformat()} to {week_end.isoformat()})"
            weeks.append((label, cursor, week_end, events_in_week))
            week_index += 1
            cursor = week_end + timedelta(days=1)
        return weeks

    def _safe_task_call(self, method_name: str) -> List[Any]:
        if hasattr(self.task_engine, method_name):
            try:
                return list(getattr(self.task_engine, method_name)())
            except TypeError:
                return list(getattr(self.task_engine, method_name))
        return []

    # ------------------------------------------------------------------
    # Core capabilities
    # ------------------------------------------------------------------
    def gather_month_events(self, start_date: Optional[date | datetime | str] = None, end_date: Optional[date | datetime | str] = None) -> Dict[str, Any]:
        """Load all events for the target month and compute quick statistics."""

        start, end = self._resolve_month_range(start_date, end_date)
        events = self.timeline_manager.get_events(start_date=start.isoformat(), end_date=end.isoformat())

        categories: Dict[str, int] = {}
        tags: Dict[str, int] = {}
        sentiment_summary: Dict[str, int] = {}

        for event in events:
            category = getattr(event, "type", "") or "uncategorized"
            categories[category] = categories.get(category, 0) + 1

            for tag in getattr(event, "tags", []) or []:
                tags[tag] = tags.get(tag, 0) + 1

            meta = getattr(event, "metadata", {}) or {}
            sentiment = meta.get("sentiment") or meta.get("tone") or "neutral"
            sentiment_summary[sentiment] = sentiment_summary.get(sentiment, 0) + 1

        week_splits: Dict[str, Dict[str, Any]] = {}
        for label, w_start, w_end, week_events in self._week_ranges(start, end, events):
            week_splits[label] = {
                "start": w_start.isoformat(),
                "end": w_end.isoformat(),
                "count": len(week_events),
            }

        return {
            "events": events,
            "stats": {
                "count": len(events),
                "categories": categories,
                "tags": tags,
                "sentiment_summary": sentiment_summary,
                "week_splits": week_splits,
            },
        }

    def summarize_month_tasks(self) -> Dict[str, Any]:
        """Summarize task performance and efficiency for the month."""

        summary: Dict[str, Any] = {
            "completed": [],
            "overdue": [],
            "new_tasks": [],
            "priority": [],
            "efficiency_score": 0.0,
            "week_breakdowns": [],
        }

        if hasattr(self.task_engine, "summarize_month"):
            summary.update(getattr(self.task_engine, "summarize_month")() or {})
        else:
            summary["completed"] = self._safe_task_call("get_completed_tasks")
            summary["overdue"] = self._safe_task_call("get_overdue_tasks") or self._safe_task_call("get_overdue")
            summary["new_tasks"] = self._safe_task_call("get_new_tasks")
            summary["priority"] = self._safe_task_call("get_priority_tasks") or self._safe_task_call("get_priority")

        if hasattr(self.task_engine, "weekly_breakdown"):
            summary["week_breakdowns"] = getattr(self.task_engine, "weekly_breakdown")()
        elif hasattr(self.task_engine, "breakdown_by_week"):
            summary["week_breakdowns"] = getattr(self.task_engine, "breakdown_by_week")()

        if "efficiency_score" not in summary or summary.get("efficiency_score") is None:
            completed_count = len(summary.get("completed", []))
            overdue_count = len(summary.get("overdue", []))
            base = completed_count + overdue_count or 1
            summary["efficiency_score"] = round(completed_count / base, 2)

        return summary

    def _call_weekly_arc_engine(self, events: List[TimelineEvent], start: date, end: date) -> Any:
        methods = [
            "construct_week_arc",
            "construct_weekly_arc",
            "build_weekly_arc",
            "create_weekly_arc",
            "build_week_arc",
        ]
        for method_name in methods:
            if hasattr(self.weekly_arc_engine, method_name):
                method = getattr(self.weekly_arc_engine, method_name)
                try:
                    return method(events=events, start_date=start, end_date=end)
                except TypeError:
                    try:
                        return method(events)
                    except TypeError:
                        return method(start, end, events)
        if hasattr(self.weekly_arc_engine, "stitch"):
            return self.weekly_arc_engine.stitch(events)
        return {"narrative": {"hook": "", "arc": ""}}

    def synthesize_weekly_arcs(self, start_date: Optional[date | datetime | str] = None, end_date: Optional[date | datetime | str] = None, events: Optional[List[TimelineEvent]] = None) -> List[Dict[str, Any]]:
        """Run the WeeklyArcEngine across each week in the month."""

        start, end = self._resolve_month_range(start_date, end_date)
        month_events = events or self.timeline_manager.get_events(start_date=start.isoformat(), end_date=end.isoformat())

        weekly_arcs: List[Dict[str, Any]] = []
        for label, w_start, w_end, week_events in self._week_ranges(start, end, month_events):
            weekly_arcs.append({
                "week_label": label,
                "arc": self._call_weekly_arc_engine(week_events, w_start, w_end),
            })
        return weekly_arcs

    def infer_monthly_themes(self, events: Sequence[TimelineEvent], weekly_arcs: Sequence[Dict[str, Any]]) -> List[str]:
        """Detect aggregated themes and motifs across the month."""

        tag_counts: Dict[str, int] = {}
        for event in events:
            for tag in getattr(event, "tags", []) or []:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

        trending = [tag for tag, count in tag_counts.items() if count > 1]
        if not trending and tag_counts:
            trending = [tag for tag, _ in sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)][:3]

        motifs: List[str] = []
        for week in weekly_arcs:
            arc = week.get("arc", {})
            if isinstance(arc, dict):
                narrative = arc.get("narrative", {}) or {}
                if narrative.get("arc"):
                    motifs.append(str(narrative.get("arc")))

        emotional_patterns = []
        for event in events:
            meta = getattr(event, "metadata", {}) or {}
            mood = meta.get("sentiment") or meta.get("tone")
            if mood:
                emotional_patterns.append(mood)

        special_tracks = []
        for keyword in ["robotics", "omega1", "japanese", "bjj", "training"]:
            if keyword in tag_counts:
                special_tracks.append(f"Progress in {keyword}")

        themes = []
        if trending:
            themes.append(f"Trending tags: {', '.join(sorted(trending))}")
        if motifs:
            themes.append(f"Repeated motifs: {', '.join(motifs)}")
        if emotional_patterns:
            themes.append(f"Emotional patterns: {', '.join(emotional_patterns)}")
        if special_tracks:
            themes.extend(special_tracks)

        return themes or ["No major themes detected."]

    def detect_epic_progression(self, events: Sequence[TimelineEvent]) -> List[Dict[str, Any]]:
        """Cluster events by epic tags to track milestone progress."""

        epic_tags = {
            "robotics": "Robotics: Omega-1",
            "omega1": "Robotics: Omega-1",
            "japanese": "Japanese Language",
            "bjj": "Brazilian Jiu-Jitsu",
            "finances": "Finances",
            "relationships": "Relationships",
            "health": "Health",
            "career": "Career",
        }

        epic_events: Dict[str, List[TimelineEvent]] = {}
        for event in events:
            for tag in getattr(event, "tags", []) or []:
                if tag in epic_tags:
                    epic_key = epic_tags[tag]
                    epic_events.setdefault(epic_key, []).append(event)

        epics: List[Dict[str, Any]] = []
        for epic, epic_group in epic_events.items():
            milestones = [getattr(e, "title", "") for e in epic_group if getattr(e, "title", "")]
            progress_note = f"{len(epic_group)} updates recorded."
            epics.append({"epic": epic, "progress": progress_note, "milestones": milestones})

        return epics

    def generate_month_narrative(self, events: Optional[List[TimelineEvent]] = None, weekly_arcs: Optional[Sequence[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """Stitch a cohesive month-long narrative chapter."""

        month_events = events or self.gather_month_events().get("events", [])
        stitched = self.narrative_stitcher.stitch(month_events) if hasattr(self.narrative_stitcher, "stitch") else ""

        subplots = []
        turning_points = []
        if weekly_arcs:
            for week in weekly_arcs:
                arc = week.get("arc", {})
                if isinstance(arc, dict):
                    narrative = arc.get("narrative", {}) or {}
                    if narrative.get("arc"):
                        subplots.append(str(narrative.get("arc")))
                    if narrative.get("turning_points"):
                        tp = narrative.get("turning_points")
                        if isinstance(tp, (list, tuple)):
                            turning_points.extend(tp)
                        else:
                            turning_points.append(str(tp))

        if not turning_points:
            turning_points = [getattr(event, "title", "") for event in month_events[:3] if getattr(event, "title", "")]

        return {
            "hook": stitched if isinstance(stitched, str) else getattr(stitched, "hook", ""),
            "arc": stitched if isinstance(stitched, str) else getattr(stitched, "arc", ""),
            "subplots": subplots,
            "turning_points": turning_points,
            "climax": turning_points[0] if turning_points else "",
            "resolution": "Trajectory set for next month.",
        }

    def run_monthly_drift_audit(self, events: Optional[List[TimelineEvent]] = None) -> Dict[str, Any]:
        """Audit for drift issues across the monthly slice."""

        month_events = events or self.timeline_manager.get_events(include_archived=True)
        issues = self.drift_auditor.audit(month_events) if hasattr(self.drift_auditor, "audit") else []
        severity = "low"
        if len(issues) > 5:
            severity = "high"
        elif len(issues) > 0:
            severity = "medium"

        notes = "No drift detected." if not issues else f"{len(issues)} drift signals detected."
        return {"issues": issues, "severity": severity, "notes": notes}

    def construct_month_arc(self, start_date: Optional[date | datetime | str] = None, end_date: Optional[date | datetime | str] = None) -> Dict[str, Any]:
        """Assemble the full monthly arc payload."""

        month_data = self.gather_month_events(start_date=start_date, end_date=end_date)
        events = month_data.get("events", [])
        weekly_arcs = self.synthesize_weekly_arcs(start_date=start_date, end_date=end_date, events=events)
        narrative = self.generate_month_narrative(events=events, weekly_arcs=weekly_arcs)
        themes = self.infer_monthly_themes(events, weekly_arcs)
        epics = self.detect_epic_progression(events)
        drift = self.run_monthly_drift_audit(events)
        tasks = self.summarize_month_tasks()

        start, end = self._resolve_month_range(start_date, end_date)
        time_window = f"{start.isoformat()} to {end.isoformat()}"

        return {
            "time_window": time_window,
            "events": month_data,
            "tasks": tasks,
            "weekly_arcs": weekly_arcs,
            "narrative": narrative,
            "themes": themes,
            "epics": epics,
            "drift": drift,
        }

    def render_arc(self, template: str = "default", start_date: Optional[date | datetime | str] = None, end_date: Optional[date | datetime | str] = None) -> str:
        """Render the monthly arc in markdown, JSON, or HTML."""

        arc = self.construct_month_arc(start_date=start_date, end_date=end_date)
        from .monthly_templates import compressed_md_template, default_md_template

        if template == "json":
            return json.dumps(arc, default=self._serialize, indent=2)
        if template == "compressed":
            return compressed_md_template(arc)
        if template == "html":
            md = default_md_template(arc)
            return f"<pre>{md}</pre>"
        return default_md_template(arc)

    def _serialize(self, obj: Any) -> Any:
        if isinstance(obj, TimelineEvent):
            return obj.__dict__
        return str(obj)


__all__ = ["MonthlyArcEngine"]
