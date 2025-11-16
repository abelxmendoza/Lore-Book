from __future__ import annotations

from datetime import UTC, datetime, timedelta

from lorekeeper.autopilot_engine import AutopilotEngine
from lorekeeper.event_schema import TimelineEvent


class DummyInsight:
    def summarize(self, data):  # pragma: no cover - placeholder
        return f"Summary of {len(data)} items"


def build_engine():
    base = datetime.now(UTC).date()
    wednesday = base + timedelta(days=(2 - base.weekday()))
    timeline = [
        TimelineEvent(date=wednesday.isoformat(), title="Deep work", tags=["build"], metadata={"hour": 9}),
        TimelineEvent(date=(wednesday + timedelta(days=7)).isoformat(), title="Skill practice", tags=["skill"], metadata={"hour": 9}),
        TimelineEvent(date=(wednesday + timedelta(days=14)).isoformat(), title="Coaching", tags=["skill"], metadata={"hour": 15}),
        TimelineEvent(date=(wednesday + timedelta(days=1)).isoformat(), title="Reflection", tags=["journal"], metadata={"hour": 7}),
    ]

    overdue_base = datetime.now(UTC) - timedelta(days=3)
    tasks = [
        {"title": f"Overdue {i}", "priority": 7 - i, "due_date": (overdue_base - timedelta(days=i)).isoformat(), "status": "incomplete", "category": "build"}
        for i in range(6)
    ]
    tasks.append({"title": "Completed", "priority": 3, "due_date": base.isoformat(), "status": "complete", "category": "health"})

    identity = {"motifs": ["build", "skill"], "previous_motifs": ["stability"], "emotional_slope": -0.6}
    arcs = {"current_phase": "transition", "previous_phase": "momentum"}

    return AutopilotEngine(DummyInsight(), timeline, tasks, identity, arcs)


def test_cycle_detection_prefers_wednesday():
    engine = build_engine()
    cycles = engine.analyze_cycles()
    assert cycles["peak_day"] == "Wednesday"
    assert cycles["cadence_strength"] > 0


def test_burnout_detection_is_high_with_many_overdue():
    engine = build_engine()
    alert = engine.detect_burnout_risk()
    assert alert.risk_level >= 4
    assert any("Overdue" in evidence for evidence in alert.evidence)


def test_focus_window_detection_uses_hours():
    engine = build_engine()
    window = engine.detect_focus_windows()
    assert "Hour" in window.evidence[0]
    assert window.risk_level in (1, 2)


def test_identity_shift_detection_triggers_on_slope_and_motif_change():
    engine = build_engine()
    identity_shift = engine.analyze_identity_shift()
    assert identity_shift["shift_detected"] is True
    assert "build" in engine.identity["motifs"]


def test_plan_generation_produces_structured_payloads():
    engine = build_engine()
    daily = engine.generate_daily_plan()
    weekly = engine.generate_weekly_strategy()
    monthly = engine.generate_monthly_course_correction()
    transition = engine.generate_arc_transition_guidance()

    assert daily.suggested_tasks
    assert weekly.focus_areas
    assert monthly.adjustments
    assert transition.identity_shift_detected is True


def test_renderers_return_valid_strings():
    engine = build_engine()
    md = engine.render_markdown()
    js = engine.render_json()

    assert "Autopilot Guidance" in md
    assert "daily_plan" in js


def test_evidence_is_propagated():
    engine = build_engine()
    burnout = engine.detect_burnout_risk()
    daily = engine.generate_daily_plan()

    assert burnout.evidence
    assert any("Focus areas" in item for item in daily.evidence)
