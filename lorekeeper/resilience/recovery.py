"""
Recovery Pattern Analysis
"""

from typing import List, Dict, Any
from datetime import datetime, timedelta


def analyze_recovery_patterns(recovery_events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze recovery patterns across multiple setbacks
    
    Args:
        recovery_events: List of recovery events with timestamps and durations
        
    Returns:
        Dictionary with recovery pattern analysis
    """
    if not recovery_events:
        return {
            "average_recovery_days": 0,
            "recovery_consistency": 0.0,
            "patterns": []
        }
    
    # Calculate average recovery time
    durations = [e.get('recovery_duration_days', 0) for e in recovery_events if e.get('recovery_duration_days')]
    avg_duration = sum(durations) / len(durations) if durations else 0
    
    # Analyze consistency
    if len(durations) >= 2:
        # Calculate variance
        variance = sum((d - avg_duration) ** 2 for d in durations) / len(durations)
        std_dev = variance ** 0.5
        # Consistency is inverse of coefficient of variation
        consistency = 1.0 / (1.0 + (std_dev / avg_duration if avg_duration > 0 else 1.0))
    else:
        consistency = 0.5
    
    # Detect patterns
    patterns = []
    if avg_duration < 7:
        patterns.append("fast_recovery")
    elif avg_duration < 30:
        patterns.append("moderate_recovery")
    else:
        patterns.append("slow_recovery")
    
    if consistency > 0.7:
        patterns.append("consistent_recovery")
    elif consistency < 0.3:
        patterns.append("variable_recovery")
    
    return {
        "average_recovery_days": avg_duration,
        "recovery_consistency": consistency,
        "patterns": patterns,
        "total_recoveries": len(recovery_events)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    recovery_events = kwargs.get("recovery_events", [])
    return analyze_recovery_patterns(recovery_events)

