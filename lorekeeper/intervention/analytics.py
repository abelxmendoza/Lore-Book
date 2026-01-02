"""
Intervention Analytics Entry Point
"""

from typing import List, Dict, Any


def analyze(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Main entry point for intervention analysis
    
    Args:
        events: List of events with id, timestamp, content, embedding
        
    Returns:
        Dictionary with interventions list
    """
    from .spirals import detect_spirals
    from .drift import detect_drift
    from .anomaly import detect_anomalies
    from .patterns import detect_patterns

    interventions = []
    
    # Run all detection modules
    interventions.extend(detect_spirals(events))
    interventions.extend(detect_drift(events))
    interventions.extend(detect_anomalies(events))
    interventions.extend(detect_patterns(events))

    return {
        "interventions": interventions
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    events = kwargs.get("events", [])
    return analyze(events)

