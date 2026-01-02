"""Analytics entry point for chronology engine."""
import json
import sys
from typing import Dict, List, Any

from .clustering import cluster_events
from .causality import detect_causality
from .sequences import sequence_alignment
from .patterns import pattern_detection


def analyze(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Main entry point for chronology analytics.
    Accepts events from stdin (JSON) and returns structured results.
    """
    try:
        # If events is empty or None, return empty results
        if not events:
            return {
                "clusters": {"labels": []},
                "causality": {"causal_links": []},
                "alignment": {"alignment_score": 0.0},
                "patterns": [],
            }

        # Run all analytics modules
        clusters = cluster_events(events)
        causality = detect_causality(events)
        alignment = sequence_alignment(events)
        patterns = pattern_detection(events)

        return {
            "clusters": clusters,
            "causality": causality,
            "alignment": alignment,
            "patterns": patterns,
        }
    except Exception as e:
        # Return empty results on failure
        return {
            "clusters": {"labels": []},
            "causality": {"causal_links": []},
            "alignment": {"alignment_score": 0.0},
            "patterns": [],
            "error": str(e),
        }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge."""
    events = kwargs.get("events", [])
    return analyze(events)


if __name__ == "__main__":
    # Read from stdin if called directly
    payload = json.loads(sys.stdin.read() or "{}")
    events = payload.get("events", [])
    result = analyze(events)
    print(json.dumps(result, default=str))

