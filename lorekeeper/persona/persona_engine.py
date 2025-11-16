from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from ..event_schema import TimelineEvent
from .persona_rules import build_behavior_rules
from .persona_state import PersonaState


class OmegaPersonaEngine:
    def __init__(self, identity_engine, timeline_manager, season_engine):
        self.identity_engine = identity_engine
        self.timeline_manager = timeline_manager
        self.season_engine = season_engine
        self.state_history: List[PersonaState] = []
        self.current_state: Optional[PersonaState] = None

    # Utilities
    def _load_events(self, events: Optional[Iterable[TimelineEvent]] = None) -> List[TimelineEvent]:
        if events is not None:
            loaded = list(events)
        elif self.timeline_manager:
            loaded = list(self.timeline_manager.get_events())
        else:
            loaded = []
        return sorted(loaded, key=lambda e: e.date)

    def _season_motifs(self, events: List[TimelineEvent]) -> List[str]:
        if not self.season_engine:
            return []
        try:
            season_data = self.season_engine.gather_season_range()
            monthly = season_data.get("monthly_arcs", []) if isinstance(season_data, dict) else []
            season_events = season_data.get("events", events) if isinstance(season_data, dict) else events
            themes = self.season_engine.detect_season_themes(monthly, season_events)
            return themes[:5] if themes else []
        except Exception:
            return []

    def derive_persona_version(self, events: Optional[Iterable[TimelineEvent]] = None) -> str:
        events = self._load_events(events)
        versions = []
        if self.identity_engine:
            versions = self.identity_engine.infer_identity_versions(events)
        latest_label = versions[-1]["label"] if versions else "Origin Persona"

        season_themes = self._season_motifs(events)
        if season_themes:
            return f"{latest_label} · {season_themes[0]}"
        return latest_label

    def derive_motifs(self, events: Optional[Iterable[TimelineEvent]] = None) -> List[str]:
        events = self._load_events(events)
        motifs = []
        if self.identity_engine:
            motifs = self.identity_engine.derive_core_motifs(events)
        seasonal = self._season_motifs(events)
        for motif in seasonal:
            if motif not in motifs:
                motifs.append(motif)
        return motifs or ["curiosity", "stability", "growth"]

    def derive_behavioral_biases(self, events: Optional[Iterable[TimelineEvent]] = None) -> Dict[str, Any]:
        events = self._load_events(events)
        biases: Dict[str, Any] = {}
        if self.identity_engine:
            biases.update(self.identity_engine.detect_behavior_patterns(events))

        monthly_activity: Dict[str, int] = {}
        for event in events:
            month = event.date[:7]
            monthly_activity[month] = monthly_activity.get(month, 0) + 1
        if monthly_activity:
            average = sum(monthly_activity.values()) / len(monthly_activity)
            current_month = sorted(monthly_activity.keys())[-1]
            recent = monthly_activity[current_month]
            biases["journaling_rhythm"] = "surging" if recent > average * 1.2 else "steady" if recent >= average * 0.8 else "quiet"
            biases["average_monthly_entries"] = round(average, 2)

        if events:
            last = events[-1]
            if "drift" in [t.lower() for t in last.tags]:
                biases["drift_alert"] = True
        return biases

    def derive_voice_traits(self, events: Optional[Iterable[TimelineEvent]] = None) -> Dict[str, Any]:
        events = self._load_events(events)
        emotions = self.identity_engine.compute_emotional_slope(events) if self.identity_engine else {}
        motifs = self.derive_motifs(events)

        tone = "observant"
        if emotions.get("trend") == "rising":
            tone = "energized"
        elif emotions.get("trend") == "falling":
            tone = "grounded"

        cadence = "reflective" if emotions.get("stability") == "turbulent" else "crisp"
        vocabulary = "precise, motif-aware" if motifs else "minimal"
        return {
            "tone": tone,
            "cadence": cadence,
            "vocabulary": vocabulary,
            "motifs": motifs,
            "emotional_trend": emotions.get("trend", "stable"),
        }

    def update_persona_state(self, event: Optional[TimelineEvent] = None) -> PersonaState:
        events = self._load_events()
        if event is not None:
            events = sorted([*events, event], key=lambda e: e.date)

        version = self.derive_persona_version(events)
        motifs = self.derive_motifs(events)
        emotions = self.identity_engine.compute_emotional_slope(events) if self.identity_engine else {}
        behaviors = self.derive_behavioral_biases(events)
        voice = self.derive_voice_traits(events)

        state = PersonaState(
            version=version,
            driving_motifs=motifs,
            emotional_vector=emotions,
            behavioral_slopes=behaviors,
            tone_profile=voice,
            last_updated=datetime.utcnow(),
        )
        self.current_state = state
        self.state_history.append(state)
        return state

    def generate_persona_description(self, state: Optional[PersonaState] = None) -> str:
        state = state or self.current_state or self.update_persona_state()
        rules = build_behavior_rules(state)
        description = [
            "Omega Persona Snapshot",
            f"Who am I right now? {state.version}",
            f"What phase am I in? Driven by {', '.join(state.driving_motifs[:5])}",
            "What drives me? Behavioral biases include:",
        ]
        for key, value in state.behavioral_slopes.items():
            description.append(f"- {key}: {value}")
        description.append(
            f"How am I evolving? Emotional slope is {state.emotional_vector.get('trend', 'stable')} "
            f"({state.emotional_vector.get('overall_slope', 0):.2f}), stability {state.emotional_vector.get('stability', 'unknown')}"
        )
        description.append("Voice and tone cues:")
        for key, value in rules.items():
            description.append(f"- {key}: {value}")
        return "\n".join(description)

    def export_state(self) -> Dict[str, Any]:
        state = self.current_state or self.update_persona_state()
        payload = asdict(state)
        payload["last_updated"] = state.last_updated.isoformat()
        payload["rules"] = build_behavior_rules(state)
        payload["history"] = [s.as_dict() for s in self.state_history[-5:]]
        return payload
