"""
Health Seasonality Detection
Detects seasonal patterns in health events
"""

from typing import List, Dict, Any
from collections import defaultdict


def detect_seasonality(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect seasonal patterns in health events
    
    Args:
        events: List of health events with timestamp
        
    Returns:
        Dictionary with seasonal patterns
    """
    # Group by month
    by_month = defaultdict(int)
    
    for event in events:
        timestamp = event.get('timestamp', '')
        if timestamp:
            # Extract month from timestamp
            try:
                month = int(timestamp.split('-')[1]) if '-' in timestamp else 1
                by_month[month] += 1
            except:
                pass
    
    # Find peak months
    if by_month:
        max_count = max(by_month.values())
        peak_months = [m for m, c in by_month.items() if c == max_count]
    else:
        peak_months = []
    
    return {
        "by_month": dict(by_month),
        "peak_months": peak_months
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    events = kwargs.get("events", [])
    return detect_seasonality(events)

