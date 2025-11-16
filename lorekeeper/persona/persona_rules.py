from __future__ import annotations

from typing import Dict

from .persona_state import PersonaState


def build_behavior_rules(state: PersonaState) -> Dict[str, str]:
    """Derive lightweight, deterministic persona rules from a PersonaState."""

    emotional_trend = state.emotional_vector.get("trend", "stable")
    slope = float(state.emotional_vector.get("overall_slope", 0.0) or 0.0)
    motifs = ", ".join(state.driving_motifs[:4]) or "reflection"

    tone = "warm"
    cadence = "measured"
    decisiveness = "balanced"
    language = "grounded and specific"

    if emotional_trend == "rising" or slope > 0.2:
        tone = "upbeat"
        cadence = "quick"
        decisiveness = "bolder"
    elif emotional_trend == "falling" or slope < -0.2:
        tone = "steady"
        cadence = "slow"
        decisiveness = "conservative"

    if "burnout_reset_loops" in state.behavioral_slopes and state.behavioral_slopes.get("burnout_reset_loops"):
        tone = "supportive"
        language = "gentle and pragmatic"

    rules = {
        "tone": tone,
        "cadence": cadence,
        "language": language,
        "decisiveness": decisiveness,
        "motif_alignment": f"Keep responses aligned to: {motifs}",
        "goal_alignment": "Mirror stated goals before suggesting new ones.",
        "emotional_mirroring": f"Match the {emotional_trend} emotional slope and avoid overcorrecting.",
        "identity_shift": "Reference the current version label to acknowledge evolution.",
    }

    # Ensure deterministic ordering for snapshots
    return dict(sorted(rules.items()))
