"""Season-scale narrative engine that stitches together multiple monthly arcs."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict, is_dataclass
from datetime import date, datetime, timedelta
from typing import Any, Iterable, List, Optional


class SeasonEngine:
    def __init__(
        self,
        monthly_arc_engine,
        timeline_manager,
        narrative_stitcher,
        task_engine,
        drift_auditor,
        character_engine=None,
    ):
        self.monthly_arc_engine = monthly_arc_engine
        self.timeline_manager = timeline_manager
        self.narrative_stitcher = narrative_stitcher
        self.task_engine = task_engine
        self.drift_auditor = drift_auditor
        self.character_engine = character_engine

    def _coerce_date(self, value: Optional[Any]) -> Optional[date]:
        if value is None:
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            return datetime.fromisoformat(value).date()
        raise TypeError("Date values must be ISO strings or datetime.date instances")

    def _serialize(self, obj: Any) -> Any:
        if is_dataclass(obj):
            return asdict(obj)
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        if isinstance(obj, list):
            return [self._serialize(item) for item in obj]
        if isinstance(obj, dict):
            return {key: self._serialize(value) for key, value in obj.items()}
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return obj

    def _month_labels(self, start: date, end: date) -> List[str]:
        labels: List[str] = []
        cursor = date(year=start.year, month=start.month, day=1)
        end_month = date(year=end.year, month=end.month, day=1)
        while cursor <= end_month:
            labels.append(cursor.strftime("%Y-%m"))
            if cursor.month == 12:
                cursor = date(year=cursor.year + 1, month=1, day=1)
            else:
                cursor = date(year=cursor.year, month=cursor.month + 1, day=1)
        return labels

    def gather_season_range(self, start_date: Optional[Any] = None, end_date: Optional[Any] = None) -> dict[str, Any]:
        start = self._coerce_date(start_date)
        end = self._coerce_date(end_date)

        all_events = self.timeline_manager.get_events()

        if not end and all_events:
            end = max(datetime.fromisoformat(event.date).date() for event in all_events)
        if not end:
            end = datetime.utcnow().date()

        if not start and all_events:
            tagged_starts = [
                datetime.fromisoformat(event.date).date()
                for event in all_events
                if "season_start" in getattr(event, "tags", [])
            ]
            if tagged_starts:
                start = max(date for date in tagged_starts if date <= end)
        if not start:
            default_start = end - timedelta(days=180)
            if all_events:
                earliest = min(datetime.fromisoformat(event.date).date() for event in all_events)
                start = max(default_start, earliest)
            else:
                start = default_start

        events = self.timeline_manager.get_events(start_date=start.isoformat(), end_date=end.isoformat())
        months = self._month_labels(start, end)
        monthly_arcs = self.load_monthly_arcs(months)

        tag_counter: Counter[str] = Counter()
        sentiment_trends: list[dict[str, Any]] = []
        epic_counts: Counter[str] = Counter()

        events_by_month: defaultdict[str, list[Any]] = defaultdict(list)
        for event in events:
            tag_counter.update(getattr(event, "tags", []))
            for tag in getattr(event, "tags", []):
                normalized = tag.lower()
                if normalized in {"robotics", "omega1", "japanese", "bjj", "career", "finances"}:
                    epic_counts[normalized] += 1
            month_label = event.date[:7]
            events_by_month[month_label].append(event)

        for label in months:
            month_events = events_by_month.get(label, [])
            scores: list[float] = []
            sentiments: Counter[str] = Counter()
            for event in month_events:
                metadata = getattr(event, "metadata", {}) or {}
                sentiment_value = metadata.get("sentiment")
                if sentiment_value:
                    sentiments[str(sentiment_value)] += 1
                score = metadata.get("sentiment_score")
                if isinstance(score, (int, float)):
                    scores.append(float(score))
            entry: dict[str, Any] = {"month": label, "counts": dict(sentiments)}
            if scores:
                entry["average_score"] = sum(scores) / len(scores)
            sentiment_trends.append(entry)

        return {
            "months": months,
            "events": events,
            "monthly_arcs": monthly_arcs,
            "stats": {
                "tag_distribution": dict(tag_counter),
                "sentiment_trends": sentiment_trends,
                "epic_counts": dict(epic_counts),
            },
        }

    def load_monthly_arcs(self, months: Iterable[str]) -> list[dict[str, Any]]:
        arcs: list[dict[str, Any]] = []
        for month in months:
            if hasattr(self.monthly_arc_engine, "construct_month_arc"):
                arc = self.monthly_arc_engine.construct_month_arc(month)
            elif hasattr(self.monthly_arc_engine, "generate_month_arc"):
                arc = self.monthly_arc_engine.generate_month_arc(month)
            elif callable(getattr(self.monthly_arc_engine, "generate", None)):
                arc = self.monthly_arc_engine.generate(month)
            else:
                arc = {}
            arcs.append({"label": month, "arc": arc})
        return arcs

    def detect_season_themes(self, monthly_arcs: list[dict[str, Any]], events: List[Any]) -> list[str]:
        themes: list[str] = []
        tag_counter: Counter[str] = Counter()
        for event in events:
            tag_counter.update(getattr(event, "tags", []))
        dominant = [tag.title() for tag, _ in tag_counter.most_common(5)]
        themes.extend(dominant)

        for month in monthly_arcs:
            arc = month.get("arc", {}) or {}
            arc_themes = arc.get("themes") or []
            themes.extend([str(theme) for theme in arc_themes])
            arc_tags = arc.get("tags") or []
            themes.extend([str(tag).title() for tag in arc_tags])

        category_map = {
            "robotics": "Rise of Robotics",
            "omega1": "Omega-1 Evolution",
            "japanese": "Language Growth",
            "bjj": "Martial Momentum",
            "career": "Career Trajectory",
            "finances": "Financial Discipline",
            "relationships": "Relationship Dynamics",
        }
        for tag in tag_counter:
            normalized = tag.lower()
            if normalized in category_map:
                themes.append(category_map[normalized])

        unique_themes: list[str] = []
        for theme in themes:
            if theme and theme not in unique_themes:
                unique_themes.append(theme)
        return unique_themes or ["Exploration"]

    def detect_epic_arcs(self, events: List[Any], monthly_arcs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        clusters: defaultdict[str, list[Any]] = defaultdict(list)
        keyword_map = {
            "robotics": "Robotics: Omega-1 Genesis",
            "omega1": "Omega-1 Genesis",
            "japanese": "Japanese Mastery",
            "bjj": "BJJ Advancement",
            "finances": "Financial Stability",
            "career": "Career Momentum",
            "relationships": "Relationship Dynamics",
            "personal": "Personal Development",
        }

        for event in events:
            for tag in getattr(event, "tags", []):
                key = tag.lower()
                if key in keyword_map:
                    clusters[key].append(event)

        for month in monthly_arcs:
            arc = month.get("arc", {}) or {}
            for tag in arc.get("tags", []) or []:
                key = str(tag).lower()
                if key in keyword_map:
                    clusters[key].append(arc)

        epics: list[dict[str, Any]] = []
        for key, items in clusters.items():
            titles: list[str] = []
            for item in items:
                title = getattr(item, "title", None) or getattr(item, "get", lambda _k: None)("title")
                if callable(title):
                    try:
                        title = title("title")  # type: ignore[misc]
                    except Exception:
                        title = None
                if not title and isinstance(item, dict):
                    title = item.get("title")
                if title:
                    titles.append(str(title))
            phases = ["Definition", "Implementation", "Breakthrough"]
            milestones = titles[:5] if titles else ["Momentum building"]
            epics.append(
                {
                    "epic": keyword_map.get(key, key.title()),
                    "phases": phases,
                    "progress": f"{len(items)} beats recorded",
                    "key_milestones": milestones,
                }
            )
        return epics

    def generate_season_narrative(
        self, monthly_arcs: list[dict[str, Any]], themes: list[str], epics: list[dict[str, Any]]
    ) -> dict[str, Any]:
        hooks = [str(month.get("arc", {}).get("narrative", {}).get("hook", "")) for month in monthly_arcs]
        hook_text = next((hook for hook in hooks if hook), "A new season dawns with fresh momentum.")

        if epics:
            main_epic = epics[0]["epic"]
            main_arc = f"{main_epic} weaves through the months, guided by themes like {', '.join(themes[:3])}."
        else:
            main_arc = "Interlaced pursuits shape the months into a cohesive arc."

        stitched = self.narrative_stitcher.stitch([])
        subplots = [stitched] if stitched else []
        for epic in epics[1:3]:
            subplots.append(f"{epic['epic']} advances through phases: {', '.join(epic['phases'])}.")

        turning_points = [hook for hook in hooks if hook][:3]
        climax = "A pivotal convergence of robotics mastery and personal growth."
        resolution = "Goals crystallize into habits, anchoring the next ascent."
        next_hook = "The next season opens with bolder experiments and deeper relationships."

        return {
            "opening": hook_text,
            "main_arc": main_arc,
            "subplots": subplots,
            "turning_points": turning_points,
            "climax": climax,
            "resolution": resolution,
            "next_season_hook": next_hook,
        }

    def run_seasonal_drift_audit(self, events: List[Any]) -> dict[str, Any]:
        flags = self.drift_auditor.audit(events)
        severity_levels = {"low": 1, "medium": 2, "high": 3}
        highest = "low"
        for flag in flags:
            level = getattr(flag, "severity", "low")
            if severity_levels.get(level, 1) > severity_levels.get(highest, 1):
                highest = level
        notes = "; ".join(getattr(flag, "notes", "") for flag in flags) if flags else "No drift detected."
        return {"issues": flags, "severity": highest, "notes": notes}

    def construct_season(self, start_date: Optional[Any] = None, end_date: Optional[Any] = None) -> dict[str, Any]:
        season_data = self.gather_season_range(start_date=start_date, end_date=end_date)
        months = season_data["months"]
        events = season_data["events"]
        monthly_arcs = season_data["monthly_arcs"]

        themes = self.detect_season_themes(monthly_arcs, events)
        epics = self.detect_epic_arcs(events, monthly_arcs)
        narrative = self.generate_season_narrative(monthly_arcs, themes, epics)
        drift = self.run_seasonal_drift_audit(events)

        season_label = f"{months[0]} to {months[-1]}" if months else "Season"
        time_window = season_label

        return {
            "season_label": season_label,
            "time_window": time_window,
            "months": months,
            "themes": themes,
            "epics": epics,
            "narrative": narrative,
            "drift": drift,
            "monthly_arcs": monthly_arcs,
            "stats": season_data["stats"],
        }

    def render_season(self, season: dict[str, Any], template: str = "default") -> str:
        from .season_templates import compressed_md_template, default_md_template

        if template == "default":
            return default_md_template(season)
        if template == "compressed":
            return compressed_md_template(season)
        if template == "json":
            serializable = json.loads(json.dumps(season, default=self._serialize))
            return json.dumps(serializable, indent=2, ensure_ascii=False)
        if template == "html":
            markdown = default_md_template(season)
            return f"<html><body><pre>{markdown}</pre></body></html>"
        raise ValueError(f"Unsupported template: {template}")


def main() -> None:  # pragma: no cover - simple CLI entrypoint
    import argparse

    parser = argparse.ArgumentParser(description="Generate a LoreKeeper season arc")
    parser.add_argument("--template", default="default", help="Rendering template: default|compressed|json|html")
    args = parser.parse_args()

    raise SystemExit("SeasonEngine CLI requires application wiring to run.")


if __name__ == "__main__":  # pragma: no cover
    main()
