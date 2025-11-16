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
from .event_schema import TimelineEvent


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


__all__ = ["AutopilotEngine"]
