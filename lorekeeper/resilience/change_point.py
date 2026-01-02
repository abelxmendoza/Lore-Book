"""
Change Point Detection for Emotional Shifts
Detects significant emotional transitions in time series data
"""

from typing import List, Dict, Any
import numpy as np


def detect_change_points(sentiments: List[float], timestamps: List[str]) -> List[Dict[str, Any]]:
    """
    Detect change points in emotional trajectory
    
    Args:
        sentiments: List of sentiment values (-1 to +1)
        timestamps: List of timestamps
        
    Returns:
        List of change point dictionaries
    """
    if len(sentiments) < 3:
        return []
    
    change_points = []
    
    # Simple change point detection: significant shifts in sentiment
    for i in range(1, len(sentiments) - 1):
        prev = sentiments[i - 1]
        curr = sentiments[i]
        next_val = sentiments[i + 1]
        
        # Detect significant change (difference > threshold)
        diff_prev = abs(curr - prev)
        diff_next = abs(next_val - curr)
        
        # Change point if both differences are significant
        if diff_prev > 0.3 and diff_next > 0.3:
            change_points.append({
                "timestamp": timestamps[i],
                "index": i,
                "sentiment": curr,
                "change_magnitude": max(diff_prev, diff_next),
                "direction": "up" if curr > prev else "down"
            })
    
    return change_points


def detect_emotional_shifts(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect emotional shifts from journal entries
    
    Args:
        entries: List of entries with sentiment and timestamp
        
    Returns:
        List of emotional shift detections
    """
    if not entries or len(entries) < 3:
        return []
    
    # Extract sentiments and timestamps
    sentiments = [e.get("sentiment", 0.0) for e in entries]
    timestamps = [e.get("timestamp") or e.get("date") or e.get("created_at", "") for e in entries]
    
    # Detect change points
    change_points = detect_change_points(sentiments, timestamps)
    
    return change_points


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    entries = kwargs.get("entries", [])
    shifts = detect_emotional_shifts(entries)
    
    return {
        "shifts": shifts,
        "count": len(shifts)
    }

