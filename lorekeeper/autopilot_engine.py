"""AutopilotEngine: orchestrated guidance across insights, arcs, identity, and tasks."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from .event_schema import TimelineEvent


class AutopilotEngine:
    """AI-driven guidance layer that blends insights, arcs, identity patterns, and tasks."""

    def __init__(self, insight_engine, timeline, tasks, identity, arcs):
        self.insight_engine = insight_engine
        self.timeline = timeline
        self.tasks = tasks or []
        self.identity_engine = identity
        self.arcs = arcs or {}

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------
    def _load_events(self) -> List[TimelineEvent]:
        if isinstance(self.timeline, Iterable) and not hasattr(self.timeline, "get_events"):
            events = list(self.timeline)
        elif hasattr(self.timeline, "get_events"):
            events = list(self.timeline.get_events())
        else:
            events = []
        return sorted(events, key=lambda e: getattr(e, "date", ""))

    def _normalize_tasks(self) -> List[Dict[str, Any]]:
        if isinstance(self.tasks, list):
            return list(self.tasks)
        if hasattr(self.tasks, "get_tasks"):
            try:
                return list(self.tasks.get_tasks())
            except TypeError:
                return list(self.tasks.get_tasks(None, None))
        return list(getattr(self.tasks, "tasks", []))

    def _parse_date(self, value: str) -> Optional[datetime]:
        try:
            return datetime.fromisoformat(value)
        except (TypeError, ValueError):
            return None

    def _sentiment_values(self, events: Iterable[TimelineEvent]) -> List[float]:
        scores: List[float] = []
        for event in events:
            meta = getattr(event, "metadata", {}) or {}
            value = meta.get("sentiment")
            if value is None:
                value = meta.get("score") or meta.get("sentiment_score")
            try:
                scores.append(float(value))
            except (TypeError, ValueError):
                continue
        return scores

    # ------------------------------------------------------------------
    # Analyses
    # ------------------------------------------------------------------
    def analyze_cycles(self) -> Dict[str, Any]:
        events = self._load_events()
        if not events:
            return {"cadence": {}, "dominant_tags": [], "recent_pace": 0.0}

        weekday_counter: Counter[str] = Counter()
        tag_counter: Counter[str] = Counter()
        timeline_density: List[int] = []
        by_date: defaultdict[str, int] = defaultdict(int)

        for event in events:
            dt = self._parse_date(getattr(event, "date", ""))
            weekday = dt.strftime("%A") if dt else "unknown"
            weekday_counter[weekday] += 1
            tag_counter.update(getattr(event, "tags", []) or [])
            if dt:
                by_date[dt.date().isoformat()] += 1

        recent_window = sorted(by_date.keys())[-14:]
        recent_counts = [by_date[key] for key in recent_window]
        timeline_density.extend(recent_counts)

        cadence = {
            "peak_day": weekday_counter.most_common(1)[0][0],
            "lowest_day": weekday_counter.most_common()[-1][0],
            "weekday_intensity": dict(weekday_counter),
        }
        recent_pace = sum(timeline_density) / len(timeline_density) if timeline_density else 0.0

        return {
            "cadence": cadence,
            "dominant_tags": [tag for tag, _ in tag_counter.most_common(5)],
            "recent_pace": round(recent_pace, 2),
        }

    def analyze_focus_patterns(self) -> Dict[str, Any]:
        events = self._load_events()
        tasks = self._normalize_tasks()

        lookback_cutoff = datetime.utcnow().date() - timedelta(days=10)
        recent_events = [
            event
            for event in events
            if (dt := self._parse_date(getattr(event, "date", ""))) and dt.date() >= lookback_cutoff
        ]

        tag_counter: Counter[str] = Counter()
        for event in recent_events:
            tag_counter.update(getattr(event, "tags", []) or [])

        priority_tasks = [task for task in tasks if str(task.get("priority", "")).lower() in {"p1", "high", "urgent"}]
        overdue_tasks = [task for task in tasks if str(task.get("status", "")).lower() in {"overdue", "late"}]

        focus_tags = [tag for tag, _ in tag_counter.most_common(3)]
        focus_tasks = priority_tasks or overdue_tasks or tasks[:3]

        insight_focus = None
        if hasattr(self.insight_engine, "top_focus"):
            try:
                insight_focus = self.insight_engine.top_focus()
            except TypeError:
                insight_focus = self.insight_engine.top_focus(recent_events)

        return {
            "focus_tags": focus_tags,
            "priority_tasks": focus_tasks,
            "overdue": overdue_tasks,
            "insight_focus": insight_focus,
        }

    def analyze_identity_shift(self) -> Dict[str, Any]:
        versions: List[Dict[str, Any]] = []
        emotional_slope: Dict[str, Any] = {}

        if hasattr(self.identity_engine, "infer_identity_versions"):
            versions = list(self.identity_engine.infer_identity_versions())
        if hasattr(self.identity_engine, "compute_emotional_slope"):
            emotional_slope = self.identity_engine.compute_emotional_slope()

        shift = None
        if len(versions) >= 2:
            previous, current = versions[-2], versions[-1]
            shift = {
                "from": previous.get("label"),
                "to": current.get("label"),
                "trend": "upward" if current.get("sentiment", 0) >= previous.get("sentiment", 0) else "downward",
                "new_tags": list(set(current.get("dominant_tags", [])) - set(previous.get("dominant_tags", []))),
            }

        return {"versions": versions, "emotional_slope": emotional_slope, "shift": shift}

    def analyze_risk_patterns(self) -> Dict[str, Any]:
        burnout = self.detect_burnout_risk()
        slump = self.detect_slump_cycles()
        focus_windows = self.detect_focus_windows()

        return {"burnout": burnout, "slump": slump, "focus_windows": focus_windows}

    def analyze_goal_alignment(self) -> Dict[str, Any]:
        tasks = self._normalize_tasks()
        arcs = self.arcs or {}

        active_goals = []
        if isinstance(arcs, dict):
            for key in ("weekly", "monthly", "seasonal", "north_star"):
                goal = arcs.get(key)
                if goal:
                    active_goals.append(goal)
        elif isinstance(arcs, list):
            active_goals.extend(arcs)

        goal_keywords: set[str] = set()
        for goal in active_goals:
            if isinstance(goal, dict):
                goal_keywords.update(str(v).lower() for v in goal.values() if isinstance(v, str))
            elif isinstance(goal, str):
                goal_keywords.add(goal.lower())

        aligned = []
        misaligned = []
        for task in tasks:
            title = str(task.get("title") or task.get("name") or "").lower()
            if goal_keywords and any(keyword in title for keyword in goal_keywords):
                aligned.append(task)
            else:
                misaligned.append(task)

        alignment_score = len(aligned) / len(tasks) if tasks else 1.0
        return {
            "goals": active_goals,
            "alignment_score": round(alignment_score, 2),
            "aligned_tasks": aligned,
            "misaligned_tasks": misaligned,
        }

    # ------------------------------------------------------------------
    # Recommendations
    # ------------------------------------------------------------------
    def generate_daily_plan(self) -> Dict[str, Any]:
        focus = self.analyze_focus_patterns()
        risks = self.analyze_risk_patterns()
        tasks = self._normalize_tasks()

        plan_tasks = focus.get("priority_tasks") or tasks[:3]
        recharge = "Schedule a 20-minute recovery block" if risks.get("burnout", {}).get("risk_level") == "high" else "Maintain normal cadence"

        return {
            "prime_directive": focus.get("focus_tags", ["foundations"])[0] if focus.get("focus_tags") else "stability",
            "tasks": plan_tasks,
            "recharge": recharge,
            "warnings": {"burnout": risks.get("burnout"), "slump": risks.get("slump")},
        }

    def generate_weekly_strategy(self) -> Dict[str, Any]:
        cycles = self.analyze_cycles()
        alignment = self.analyze_goal_alignment()
        skills = self.detect_skill_momentum()

        return {
            "cadence": cycles.get("cadence", {}),
            "alignment": alignment,
            "momentum": skills,
            "plays": [
                "Double down on the strongest focus tag during peak day",
                "Reserve low-energy day for admin and recovery",
                "Close at least one misaligned task or delegate it",
            ],
        }

    def generate_monthly_course_correction(self) -> Dict[str, Any]:
        identity = self.analyze_identity_shift()
        alignment = self.analyze_goal_alignment()
        risks = self.analyze_risk_patterns()

        course_correction = "Re-center on north star objectives" if alignment.get("alignment_score", 1) < 0.6 else "Maintain current trajectory"
        if identity.get("emotional_slope", {}).get("trend") == "falling":
            course_correction = "Introduce restorative weeks and refocus on energizing work"

        return {
            "identity_shift": identity,
            "alignment": alignment,
            "risks": risks,
            "directive": course_correction,
        }

    def generate_arc_transition_guidance(self) -> Dict[str, Any]:
        identity = self.analyze_identity_shift()
        arcs = self.arcs or {}
        current_arc = None
        upcoming_arc = None

        if isinstance(arcs, dict):
            current_arc = arcs.get("current") or arcs.get("active")
            upcoming_arc = arcs.get("next") or arcs.get("upcoming")
        elif isinstance(arcs, list) and arcs:
            current_arc = arcs[-1]
            upcoming_arc = arcs[-2] if len(arcs) > 1 else None

        guidance = []
        if identity.get("shift"):
            guidance.append("Document the identity shift and anchor new rituals")
        if upcoming_arc:
            guidance.append("Preload tasks and relationships that support the next arc")
        if not guidance:
            guidance.append("Stay observant for emerging themes before transitioning")

        return {
            "current": current_arc,
            "upcoming": upcoming_arc,
            "guidance": guidance,
        }

    # ------------------------------------------------------------------
    # Alerts & warnings
    # ------------------------------------------------------------------
    def detect_burnout_risk(self) -> Dict[str, Any]:
        events = self._load_events()
        recent_cutoff = datetime.utcnow().date() - timedelta(days=14)
        recent_events = [
            event
            for event in events
            if (dt := self._parse_date(getattr(event, "date", ""))) and dt.date() >= recent_cutoff
        ]

        sentiments = self._sentiment_values(recent_events)
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0.0
        has_burnout_tag = any("burnout" in [tag.lower() for tag in getattr(event, "tags", [])] for event in recent_events)

        risk_level = "high" if avg_sentiment < -0.2 or has_burnout_tag else "moderate" if avg_sentiment < 0 else "low"
        return {"risk_level": risk_level, "average_sentiment": round(avg_sentiment, 2), "evidence": len(recent_events)}

    def detect_slump_cycles(self) -> Dict[str, Any]:
        events = self._load_events()
        if not events:
            return {"status": "unknown", "streak": 0}

        by_week: defaultdict[str, int] = defaultdict(int)
        for event in events:
            dt = self._parse_date(getattr(event, "date", ""))
            if not dt:
                continue
            year, week, _ = dt.isocalendar()
            by_week[f"{year}-W{week}"] += 1

        ordered = sorted(by_week.items())
        if len(ordered) < 2:
            return {"status": "stable", "streak": 0}

        last_two = ordered[-2:]
        delta = last_two[-1][1] - last_two[0][1]
        status = "slump" if delta < -2 else "stable"
        return {"status": status, "streak": max(0, -delta)}

    def detect_focus_windows(self) -> Dict[str, Any]:
        events = self._load_events()
        if not events:
            return {"windows": []}

        by_hour: defaultdict[int, int] = defaultdict(int)
        for event in events:
            dt = self._parse_date(getattr(event, "date", ""))
            if dt:
                by_hour[dt.hour] += 1

        if not by_hour:
            return {"windows": []}

        peak_hours = sorted(by_hour.items(), key=lambda item: item[1], reverse=True)[:3]
        windows = [f"{hour:02d}:00" for hour, _ in peak_hours]
        return {"windows": windows, "counts": dict(by_hour)}

    def detect_skill_momentum(self) -> Dict[str, Any]:
        events = self._load_events()
        if not events:
            return {"momentum_tags": []}

        cutoff_recent = datetime.utcnow().date() - timedelta(days=30)
        cutoff_previous = cutoff_recent - timedelta(days=30)

        recent_counter: Counter[str] = Counter()
        previous_counter: Counter[str] = Counter()

        for event in events:
            dt = self._parse_date(getattr(event, "date", ""))
            if not dt:
                continue
            tags = getattr(event, "tags", []) or []
            if dt.date() >= cutoff_recent:
                recent_counter.update(tags)
            elif cutoff_previous <= dt.date() < cutoff_recent:
                previous_counter.update(tags)

        momentum: List[Dict[str, Any]] = []
        for tag, count in recent_counter.items():
            previous = previous_counter.get(tag, 0)
            growth = count - previous
            if growth > 0:
                momentum.append({"tag": tag, "growth": growth, "recent": count, "previous": previous})

        momentum_sorted = sorted(momentum, key=lambda item: item["growth"], reverse=True)
        return {"momentum_tags": momentum_sorted[:5]}

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------
    def render_markdown(self) -> str:
        daily = self.generate_daily_plan()
        weekly = self.generate_weekly_strategy()
        monthly = self.generate_monthly_course_correction()
        arc = self.generate_arc_transition_guidance()

        lines = ["# Autopilot Guidance", "## Daily Plan"]
        lines.append(f"- Prime directive: **{daily.get('prime_directive')}**")
        lines.append("- Tasks: " + ", ".join(str(task.get("title") or task.get("name") or task) for task in daily.get("tasks", [])))
        lines.append(f"- Recharge: {daily.get('recharge')}")

        lines.append("\n## Weekly Strategy")
        cadence = weekly.get("cadence", {})
        if cadence:
            lines.append(f"- Peak day: {cadence.get('peak_day')} | Low day: {cadence.get('lowest_day')}")
        lines.append(f"- Alignment score: {weekly.get('alignment', {}).get('alignment_score')}")
        momentum = weekly.get("momentum", {}).get("momentum_tags", [])
        if momentum:
            lines.append("- Skill momentum: " + ", ".join(f"{item['tag']} (+{item['growth']})" for item in momentum))
        lines.extend([f"- Play: {play}" for play in weekly.get("plays", [])])

        lines.append("\n## Monthly Course Correction")
        lines.append(f"- Directive: {monthly.get('directive')}")
        if monthly.get("identity_shift", {}).get("shift"):
            shift = monthly["identity_shift"]["shift"]
            lines.append(f"- Identity shift: {shift['from']} → {shift['to']} (trend: {shift['trend']})")

        lines.append("\n## Arc Transition")
        lines.append(f"- Current arc: {arc.get('current')}")
        lines.append(f"- Upcoming arc: {arc.get('upcoming')}")
        lines.extend([f"- Guidance: {item}" for item in arc.get("guidance", [])])

        return "\n".join(lines)

    def render_json(self) -> Dict[str, Any]:
        return {
            "daily": self.generate_daily_plan(),
            "weekly": self.generate_weekly_strategy(),
            "monthly": self.generate_monthly_course_correction(),
            "arc_transition": self.generate_arc_transition_guidance(),
            "analyses": {
                "cycles": self.analyze_cycles(),
                "focus": self.analyze_focus_patterns(),
                "identity": self.analyze_identity_shift(),
                "risks": self.analyze_risk_patterns(),
                "goal_alignment": self.analyze_goal_alignment(),
            },
        }

    def render_console(self) -> str:
        summary = self.render_json()
        return (
            "Autopilot Guidance\n"
            "------------------\n"
            f"Prime Directive: {summary['daily'].get('prime_directive')}\n"
            f"Recharge: {summary['daily'].get('recharge')}\n"
            f"Weekly Peak Day: {summary['weekly'].get('cadence', {}).get('peak_day')}\n"
            f"Alignment Score: {summary['weekly'].get('alignment', {}).get('alignment_score')}\n"
            f"Monthly Directive: {summary['monthly'].get('directive')}\n"
            f"Arc Guidance: {', '.join(summary['arc_transition'].get('guidance', []))}\n"
        )
