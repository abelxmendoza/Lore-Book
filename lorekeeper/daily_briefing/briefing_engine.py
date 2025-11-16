"""Daily briefing engine for generating executive-style summaries."""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List, Optional

from ..event_schema import TimelineEvent


class DailyBriefingEngine:
    """Compose and render daily executive briefings from multiple subsystems."""

    def __init__(self, timeline_manager, narrative_stitcher, task_engine, drift_auditor):
        self.timeline_manager = timeline_manager
        self.narrative_stitcher = narrative_stitcher
        self.task_engine = task_engine
        self.drift_auditor = drift_auditor

    def get_recent_activity(self, reference_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Gather timeline windows for recent activity bands."""

        ref_date = reference_date.date() if isinstance(reference_date, datetime) else (reference_date or datetime.now(UTC).date())
        periods = ["last_7_days", "last_30_days", "last_3_months", "this_year"]
        recent: Dict[str, List[TimelineEvent]] = {}
        for period in periods:
            recent[period] = self.timeline_manager.get_events_by_period(period, reference_date=ref_date)

        density_note = self._summarize_density(recent)
        return {"last_7_days": recent.get("last_7_days", []), "last_30_days": recent.get("last_30_days", []), "last_3_months": recent.get("last_3_months", []), "this_year": recent.get("this_year", []), "notes": density_note}

    def _summarize_density(self, recent: Dict[str, List[TimelineEvent]]) -> str:
        week = len(recent.get("last_7_days", []))
        month = len(recent.get("last_30_days", []))
        quarter = len(recent.get("last_3_months", []))
        if week == 0 and month == 0:
            return "No logged activity in the past month."
        return f"Activity density — week: {week}, month: {month}, quarter: {quarter}."

    def get_task_summary(self) -> Dict[str, List[Any]]:
        """Summarize tasks using the task engine categorization and scoring."""

        summary: Dict[str, List[Any]] = {
            "due_today": [],
            "due_this_week": [],
            "overdue": [],
            "completed_yesterday": [],
            "priority": [],
        }

        if hasattr(self.task_engine, "categorize_tasks"):
            categories = self.task_engine.categorize_tasks()
            for key in summary:
                summary[key] = list(categories.get(key, []))
        else:
            summary["due_today"] = self._safe_task_call("get_due_today")
            summary["due_this_week"] = self._safe_task_call("get_due_this_week")
            summary["overdue"] = self._safe_task_call("get_overdue")
            summary["completed_yesterday"] = self._safe_task_call("get_completed_yesterday")
            summary["priority"] = self._safe_task_call("get_priority_tasks")

        if hasattr(self.task_engine, "score_tasks"):
            scored = self.task_engine.score_tasks(summary)
            summary["priority"] = scored.get("priority", summary["priority"])

        return summary

    def _safe_task_call(self, method_name: str) -> List[Any]:
        if hasattr(self.task_engine, method_name):
            return list(getattr(self.task_engine, method_name)())
        return []

    def run_drift_audit(self) -> Dict[str, Any]:
        """Pass events through the drift auditor and bucket by issue type."""

        events = self.timeline_manager.get_events(include_archived=True)
        flags = self.drift_auditor.audit(events)

        contradictions: List[Any] = []
        missing_dates: List[Any] = []
        inconsistencies: List[Any] = []

        for flag in flags:
            issue_lower = flag.issue.lower()
            if "date" in issue_lower:
                missing_dates.append(flag)
            elif "conflict" in issue_lower or "contradiction" in issue_lower:
                contradictions.append(flag)
            else:
                inconsistencies.append(flag)

        notes = "No drift detected." if not flags else "Review contradictions and reconcile missing dates."
        return {
            "contradictions": contradictions,
            "missing_dates": missing_dates,
            "inconsistencies": inconsistencies,
            "notes": notes,
        }

    def build_narrative_sections(self, reference_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Generate narrative arcs across multiple horizons using stitched stories."""

        ref_date = reference_date.date() if isinstance(reference_date, datetime) else (reference_date or datetime.now(UTC).date())
        yesterday = ref_date - timedelta(days=1)
        yesterday_events = self.timeline_manager.get_events(start_date=yesterday.isoformat(), end_date=yesterday.isoformat())
        last_week_events = self.timeline_manager.get_events_by_period("last_7_days", reference_date=ref_date)
        last_month_events = self.timeline_manager.get_events_by_period("last_30_days", reference_date=ref_date)
        ytd_events = self.timeline_manager.get_events_by_period("this_year", reference_date=ref_date)

        season_summaries = self._season_summaries(ytd_events)

        return {
            "yesterday": self.narrative_stitcher.stitch(yesterday_events),
            "last_week": self.narrative_stitcher.stitch(last_week_events),
            "last_month": self.narrative_stitcher.stitch(last_month_events),
            "year_to_date": self.narrative_stitcher.stitch(ytd_events),
            "seasons": season_summaries,
        }

    def _season_summaries(self, events: List[TimelineEvent]) -> Dict[str, str]:
        summaries: Dict[str, str] = {}
        seasons: Dict[str, List[TimelineEvent]] = {}
        for event in events:
            season = event.metadata.get("season") if hasattr(event, "metadata") else None
            if season:
                seasons.setdefault(season, []).append(event)
        for season, grouped in seasons.items():
            summaries[season] = self.narrative_stitcher.stitch(grouped)
        return summaries

    def create_briefing(self) -> Dict[str, Any]:
        """Assemble the structured briefing payload."""

        recent_activity = self.get_recent_activity()
        tasks = self.get_task_summary()
        drift = self.run_drift_audit()
        narrative = self.build_narrative_sections()

        upcoming = {
            "upcoming": tasks.get("due_this_week", []),
            "overdue": tasks.get("overdue", []),
            "priority": tasks.get("priority", []),
        }

        return {
            "timestamp": datetime.now(UTC).isoformat(),
            "sections": {
                "recent_activity": recent_activity,
                "tasks": tasks,
                "narrative": narrative,
                "drift": drift,
                "upcoming": upcoming,
            },
        }

    def render_briefing(self, template: str = "default") -> str:
        """Render a briefing using the desired template format."""

        briefing = self.create_briefing()
        from .briefing_templates import compressed_md_template, default_md_template

        if template == "json":
            return json.dumps(briefing, default=self._serialize, indent=2)
        if template == "compressed":
            return compressed_md_template(briefing)
        return default_md_template(briefing)

    def _serialize(self, obj: Any) -> Any:
        if isinstance(obj, TimelineEvent):
            return obj.__dict__
        return str(obj)


__all__ = ["DailyBriefingEngine"]
