"""
Creative Cycle Regression
Predicts creative cycles using regression analysis
"""

from typing import List, Dict, Any
import statistics


def predict_cycle(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Predict creative cycle using regression
    
    Args:
        events: List of creative events over time
        
    Returns:
        Dictionary with cycle prediction
    """
    if len(events) < 4:
        return {
            "cycle_type": "unknown",
            "period_days": 0,
            "confidence": 0
        }
    
    # Sort by timestamp
    sorted_events = sorted(events, key=lambda e: e.get('timestamp', ''))
    
    # Group by week
    weeks = {}
    for event in sorted_events:
        timestamp = event.get('timestamp', '')
        if timestamp:
            try:
                # Extract week key (simplified)
                week_key = timestamp[:10]  # YYYY-MM-DD
                if week_key not in weeks:
                    weeks[week_key] = []
                weeks[week_key].append(event)
            except:
                pass
    
    if len(weeks) < 2:
        return {
            "cycle_type": "unknown",
            "period_days": 0,
            "confidence": 0
        }
    
    # Calculate weekly counts
    week_counts = [len(events) for events in weeks.values()]
    
    # Simple cycle detection: find periodicity
    avg_count = statistics.mean(week_counts)
    max_count = max(week_counts)
    min_count = min(week_counts)
    
    # Detect if there's a pattern
    if max_count > avg_count * 1.5 and min_count < avg_count * 0.5:
        cycle_type = "productivity"
        period_days = len(weeks) * 7
        confidence = min(1.0, len(weeks) / 8)
    else:
        cycle_type = "stable"
        period_days = 0
        confidence = 0.3
    
    return {
        "cycle_type": cycle_type,
        "period_days": period_days,
        "confidence": confidence,
        "weekly_counts": week_counts
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    events = kwargs.get("events", [])
    return predict_cycle(events)

