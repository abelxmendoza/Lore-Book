"""AutopilotEngine — synthesizes guidance from insights, arcs, and tasks."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional

from .autopilot_types import (
    DailyRecommendation,
    MomentumSignal,
    MonthlyCorrection,
    RiskAlert,
    TransitionGuidance,
    WeeklyStrategy,
)
"""AutopilotEngine: orchestrated guidance across insights, arcs, identity, and tasks."""

from .event_schema import TimelineEvent

__all__ = ["AutopilotEngine"]


class AutopilotEngine:
    """AI-driven guidance orchestrator."""

    def __init__(self, insight_engine, timeline, tasks, identity, arcs):
        """
        insight_engine: InsightEngine instance
        timeline: timeline events + metadata
        tasks: task engine summaries, priority scores, completion data
        identity: identity engine outputs (motifs, shifts, emotional slopes)
        arcs: weekly/monthly/season arc data
        """

        self.insight_engine = insight_engine
        self.timeline = list(timeline or [])
        self.tasks = list(tasks or [])
        self.identity = identity or {}
        self.arcs = arcs or {}

    # === Analysis Layer ===
    def analyze_cycles(self) -> Dict[str, Any]:
        """Detect weekly cadence patterns from timeline events."""

        day_counts: Counter[str] = Counter()
        for event in self.timeline:
            date_str = getattr(event, "date", None) or (event.get("date") if isinstance(event, dict) else None)
            day_name = self._safe_day_name(date_str)
            if day_name:
                day_counts[day_name] += 1

        peak_day, peak_count = (None, 0)
        if day_counts:
            peak_day, peak_count = max(day_counts.items(), key=lambda item: item[1])

        cadence_strength = min(1.0, peak_count / max(1, len(self.timeline))) if self.timeline else 0.0
        return {
            "peak_day": peak_day,
            "day_counts": dict(day_counts),
            "cadence_strength": cadence_strength,
        }

    def analyze_focus_patterns(self) -> Dict[str, Any]:
        """Aggregate tags/categories across tasks and timeline."""

        tag_counter: Counter[str] = Counter()
        for event in self.timeline:
            tags = getattr(event, "tags", None) or (event.get("tags") if isinstance(event, dict) else [])
            tag_counter.update(tags or [])

        for task in self.tasks:
            category = self._get_task_field(task, "category")
            if category:
                tag_counter[category] += 1
            tags = self._get_task_field(task, "tags") or []
            if isinstance(tags, list):
                tag_counter.update(tags)

        focus_areas = [area for area, _ in tag_counter.most_common(3)]
        return {"focus_areas": focus_areas, "evidence": dict(tag_counter)}

    def analyze_identity_shift(self) -> Dict[str, Any]:
        """Check for shifts in motifs or emotional slope."""

        emotional_slope = float(self.identity.get("emotional_slope", 0.0) or 0.0)
        motifs = set(self.identity.get("motifs", []) or [])
        previous_motifs = set(self.identity.get("previous_motifs", []) or [])
        motif_delta = motifs.difference(previous_motifs)
        shift_detected = abs(emotional_slope) >= 0.25 or bool(motif_delta)

        arc_phase = self.arcs.get("current_phase") or self.arcs.get("current")
        prior_phase = self.arcs.get("previous_phase") or self.arcs.get("previous")

        return {
            "shift_detected": shift_detected,
            "emotional_slope": emotional_slope,
            "motif_changes": sorted(motif_delta),
            "arc_transition": (arc_phase, prior_phase),
        }

    def analyze_risk_patterns(self) -> Dict[str, Any]:
        """Combine overdue work and sparse activity to surface risk."""

        overdue = [t for t in self.tasks if self._is_overdue(t)]
        recent_events = self._recent_events(days=7)
        workload = len(overdue)
        cadence = len(recent_events)
        burn_risk = min(5, max(1, workload // 2 + (0 if cadence > 5 else 1))) if (overdue or cadence) else 1

        return {
            "overdue": overdue,
            "recent_activity": cadence,
            "burnout_level": burn_risk,
        }

    def analyze_goal_alignment(self) -> Dict[str, Any]:
        """Compare focus areas against identity motifs."""

        motifs = set(self.identity.get("motifs", []) or [])
        focus = set(self.analyze_focus_patterns().get("focus_areas", []))
        alignment = len(focus & motifs) / max(1, len(focus or {"misc"}))
        return {"alignment": alignment, "aligned_tags": sorted(focus & motifs)}

    # === Recommendations Layer ===
    def generate_daily_plan(self) -> DailyRecommendation:
        cycles = self.analyze_cycles()
        focus = self.analyze_focus_patterns()
        goal_alignment = self.analyze_goal_alignment()

        prioritized_tasks = self._prioritize_tasks(limit=3)
        description = "Prioritize momentum-building tasks and protect the strongest focus window."
        evidence = [
            f"Peak cadence: {cycles.get('peak_day') or 'unknown'}",
            f"Focus areas: {', '.join(focus.get('focus_areas', [])) or 'none'}",
            f"Goal alignment: {goal_alignment['alignment']:.2f}",
        ]

        urgency = "high" if any(self._is_overdue(t) for t in prioritized_tasks) else "normal"
        confidence = 0.65 + (0.2 if cycles.get("cadence_strength", 0) > 0.25 else 0)
        return DailyRecommendation(
            description=description,
            confidence=round(confidence, 2),
            evidence=evidence,
            suggested_tasks=prioritized_tasks,
            urgency=urgency,
        )

    def generate_weekly_strategy(self) -> WeeklyStrategy:
        cycles = self.analyze_cycles()
        focus = self.analyze_focus_patterns()

        focus_areas = focus.get("focus_areas", [])
        cadence_note = f"Leaning on {cycles.get('peak_day')} cadence" if cycles.get("peak_day") else "Set a consistent anchor day"
        description = f"Concentrate on {', '.join(focus_areas) or 'core habits'} and {cadence_note.lower()}."

        confidence = 0.6 + (0.15 if focus_areas else 0)
        evidence = [cadence_note, f"Focus signals: {focus_areas or 'none detected'}"]
        return WeeklyStrategy(description=description, confidence=round(confidence, 2), evidence=evidence, focus_areas=focus_areas)

    def generate_monthly_course_correction(self) -> MonthlyCorrection:
        risk = self.analyze_risk_patterns()
        alignment = self.analyze_goal_alignment()

        adjustments = []
        if risk.get("burnout_level", 1) >= 4:
            adjustments.append("Reduce load by deferring low-impact tasks.")
        if alignment.get("alignment", 0) < 0.5:
            adjustments.append("Add tasks tied to identity motifs to restore alignment.")
        if not adjustments:
            adjustments.append("Keep current trajectory and schedule a mid-month review.")

        description = "Course-correct by balancing risk and identity alignment."
        evidence = [f"Burnout level: {risk.get('burnout_level')}", f"Alignment: {alignment.get('alignment'):.2f}"]
        confidence = 0.55 + (0.2 if adjustments else 0)
        return MonthlyCorrection(description=description, confidence=round(confidence, 2), evidence=evidence, adjustments=adjustments)

    def generate_arc_transition_guidance(self) -> TransitionGuidance:
        identity_shift = self.analyze_identity_shift()
        identity_shift_detected = identity_shift.get("shift_detected", False)
        description = "Stabilize routines while embracing the new motif." if identity_shift_detected else "Maintain present arc; no major shift detected."
        recommended_behavior = [
            "Re-commit to one anchor habit for the next 72 hours.",
            "Journal nightly on how the new motif is influencing choices."
            if identity_shift_detected
            else "Log micro-notes to watch for subtle changes.",
        ]

        evidence = [
            f"Emotional slope: {identity_shift.get('emotional_slope')}",
            f"Motif changes: {identity_shift.get('motif_changes')}",
        ]
        return TransitionGuidance(
            description=description,
            evidence=evidence,
            identity_shift_detected=identity_shift_detected,
            recommended_behavior=recommended_behavior,
        )

    # === Alerts ===
    def detect_burnout_risk(self) -> RiskAlert:
        risk = self.analyze_risk_patterns()
        evidence = [f"Overdue tasks: {len(risk.get('overdue', []))}", f"Recent activity: {risk.get('recent_activity')} events"]
        risk_level = int(risk.get("burnout_level", 1))
        confidence = 0.4 + min(0.4, risk_level * 0.08)
        return RiskAlert(alert_type="burnout_risk", confidence=round(confidence, 2), evidence=evidence, risk_level=risk_level)

    def detect_slump_cycles(self) -> RiskAlert:
        weekly_counts: Dict[str, int] = defaultdict(int)
        for event in self.timeline:
            date_str = getattr(event, "date", None) or (event.get("date") if isinstance(event, dict) else None)
            week_bucket = self._safe_week_bucket(date_str)
            if week_bucket:
                weekly_counts[week_bucket] += 1

        low_weeks = [week for week, count in weekly_counts.items() if count <= 1]
        evidence = [f"Low-activity weeks: {len(low_weeks)}"]
        risk_level = 3 if len(low_weeks) >= 2 else 2 if low_weeks else 1
        confidence = 0.35 + (0.1 * risk_level)
        return RiskAlert(alert_type="slump_cycle", confidence=round(confidence, 2), evidence=evidence, risk_level=risk_level)

    def detect_focus_windows(self) -> RiskAlert:
        hours = Counter()
        for event in self.timeline:
            hour = self._extract_hour(event)
            if hour is not None:
                hours[hour] += 1

        if not hours:
            return RiskAlert(alert_type="focus_window", confidence=0.3, evidence=["No timing metadata"], risk_level=1)

        top_hour, count = hours.most_common(1)[0]
        evidence = [f"Hour {top_hour}:00 repeated {count} times"]
        risk_level = 1 if count >= 2 else 2
        confidence = 0.55 + min(0.25, count * 0.05)
        return RiskAlert(alert_type="focus_window", confidence=round(confidence, 2), evidence=evidence, risk_level=risk_level)

    def detect_skill_momentum(self) -> MomentumSignal:
        window = datetime.now(UTC) - timedelta(days=14)
        completions: Counter[str] = Counter()
        for task in self.tasks:
            completed_at = self._get_task_field(task, "completed_at") or self._get_task_field(task, "completedAt")
            category = self._get_task_field(task, "category") or "general"
            if completed_at:
                try:
                    completed_date = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
                    if completed_date >= window:
                        completions[category] += 1
                except ValueError:
                    continue

        if not completions:
            return MomentumSignal(description="No momentum detected yet.", evidence=["No recent completions"], skill_area="general", momentum_score=0.1)

        skill_area, count = completions.most_common(1)[0]
        momentum_score = min(1.0, count / 5)
        evidence = [f"{count} completions in {skill_area} in last 14 days"]
        description = f"Momentum building in {skill_area}."
        return MomentumSignal(description=description, evidence=evidence, skill_area=skill_area, momentum_score=round(momentum_score, 2))

    # === Rendering ===
    def render_markdown(self) -> str:
        plan = self.generate_daily_plan()
        weekly = self.generate_weekly_strategy()
        monthly = self.generate_monthly_course_correction()
        transition = self.generate_arc_transition_guidance()
        burnout = self.detect_burnout_risk()
        slump = self.detect_slump_cycles()
        focus = self.detect_focus_windows()
        momentum = self.detect_skill_momentum()

        lines = [
            "# Autopilot Guidance",
            "## Daily Plan",
            f"- {plan.description} (confidence {plan.confidence})",
            f"- Suggested tasks: {self._render_list(plan.suggested_tasks)}",
            "## Weekly Strategy",
            f"- {weekly.description} (confidence {weekly.confidence})",
            "## Monthly Course Correction",
            f"- {monthly.description} (confidence {monthly.confidence})",
            "## Arc Transition",
            f"- {transition.description}",
            "## Alerts",
            f"- Burnout: level {burnout.risk_level} — {', '.join(map(str, burnout.evidence))}",
            f"- Slump: level {slump.risk_level} — {', '.join(map(str, slump.evidence))}",
            f"- Focus window: {focus.evidence[0] if focus.evidence else 'no data'}",
            f"- Momentum: {momentum.description} ({momentum.momentum_score})",
        ]
        return "\n".join(lines)

    def render_json(self) -> str:
        payload = {
            "daily_plan": asdict(self.generate_daily_plan()),
            "weekly_strategy": asdict(self.generate_weekly_strategy()),
            "monthly_correction": asdict(self.generate_monthly_course_correction()),
            "arc_transition": asdict(self.generate_arc_transition_guidance()),
            "alerts": {
                "burnout": asdict(self.detect_burnout_risk()),
                "slump": asdict(self.detect_slump_cycles()),
                "focus_window": asdict(self.detect_focus_windows()),
            },
            "momentum": asdict(self.detect_skill_momentum()),
        }
        return json.dumps(payload, default=str)

    def render_console(self) -> str:
        plan = self.generate_daily_plan()
        weekly = self.generate_weekly_strategy()
        monthly = self.generate_monthly_course_correction()
        return (
            f"Daily: {plan.description}\n"
            f"Weekly: {weekly.description}\n"
            f"Monthly: {monthly.description}\n"
            f"Urgency: {plan.urgency}"
        )

    # === Helpers ===
    def _safe_day_name(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str).strftime("%A")
        except ValueError:
            try:
                return datetime.fromisoformat(date_str.replace("Z", "+00:00")).strftime("%A")
            except ValueError:
                return None

    def _safe_week_bucket(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        try:
            date_obj = datetime.fromisoformat(date_str)
        except ValueError:
            try:
                date_obj = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            except ValueError:
                return None
        start_of_week = date_obj - timedelta(days=date_obj.weekday())
        return start_of_week.strftime("%Y-%m-%d")

    def _recent_events(self, days: int) -> List[Any]:
        now = datetime.now(UTC)
        cutoff = now - timedelta(days=days)
        recent: List[Any] = []
        for event in self.timeline:
            date_str = getattr(event, "date", None) or (event.get("date") if isinstance(event, dict) else None)
            if not date_str:
                continue
            try:
                event_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                if event_date.tzinfo is None:
                    event_date = event_date.replace(tzinfo=UTC)
                if event_date >= cutoff:
                    recent.append(event)
            except ValueError:
                continue
        return recent

    def _is_overdue(self, task: Any) -> bool:
        due = self._get_task_field(task, "due_date") or self._get_task_field(task, "dueDate")
        status = self._get_task_field(task, "status") or "incomplete"
        if not due or status == "complete":
            return False
        try:
            due_date = datetime.fromisoformat(str(due).replace("Z", "+00:00"))
            return due_date.date() < datetime.now(UTC).date()
        except ValueError:
            return False

    def _get_task_field(self, task: Any, field_name: str) -> Any:
        if hasattr(task, field_name):
            return getattr(task, field_name)
        if isinstance(task, dict):
            return task.get(field_name)
        return None

    def _prioritize_tasks(self, limit: int = 3) -> List[Any]:
        prioritized = sorted(
            self.tasks,
            key=lambda t: (
                -int(self._get_task_field(t, "priority") or 0),
                self._get_task_field(t, "due_date") or "",
            ),
        )
        return prioritized[:limit]

    def _extract_hour(self, event: Any) -> Optional[int]:
        metadata = getattr(event, "metadata", None) or (event.get("metadata") if isinstance(event, dict) else {})
        if isinstance(metadata, dict) and "hour" in metadata:
            try:
                hour_val = int(metadata["hour"])
                if 0 <= hour_val <= 23:
                    return hour_val
            except (TypeError, ValueError):
                pass
        date_str = getattr(event, "date", None) or (event.get("date") if isinstance(event, dict) else None)
        if date_str:
            try:
                return datetime.fromisoformat(date_str.replace("Z", "+00:00")).hour
            except ValueError:
                return None
        return None

    def _render_list(self, items: Iterable[Any]) -> str:
        rendered = []
        for item in items:
            if isinstance(item, TimelineEvent):
                rendered.append(item.title)
            elif isinstance(item, dict):
                rendered.append(str(item.get("title") or item.get("description") or item))
            else:
                rendered.append(str(item))
        return ", ".join(rendered) if rendered else "none"

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
