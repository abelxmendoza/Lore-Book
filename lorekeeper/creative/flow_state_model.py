"""
Flow State Modeling
Models flow states and predicts flow likelihood
"""

from typing import List, Dict, Any
import statistics


def model_flow_states(flow_states: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Model flow states and predict patterns
    
    Args:
        flow_states: List of flow state events
        
    Returns:
        Dictionary with flow model
    """
    if len(flow_states) < 2:
        return {
            "average_level": 0.5,
            "trend": "stable",
            "confidence": 0
        }
    
    levels = [f.get('level', 0.5) for f in flow_states]
    avg_level = statistics.mean(levels)
    
    # Calculate trend
    if len(levels) >= 3:
        recent_avg = statistics.mean(levels[-3:])
        earlier_avg = statistics.mean(levels[:3])
        
        if recent_avg > earlier_avg * 1.1:
            trend = "improving"
        elif recent_avg < earlier_avg * 0.9:
            trend = "declining"
        else:
            trend = "stable"
    else:
        trend = "stable"
    
    # Calculate variance (lower = more consistent flow)
    variance = statistics.variance(levels) if len(levels) > 1 else 0
    consistency = max(0, 1 - variance)
    
    return {
        "average_level": avg_level,
        "trend": trend,
        "consistency": consistency,
        "confidence": min(1.0, len(flow_states) / 10)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    flow_states = kwargs.get("flow_states", [])
    return model_flow_states(flow_states)

