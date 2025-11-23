"""
Belief/Value Drift Detection
Detects shifts in beliefs and values over time
"""

from typing import List, Dict, Any
from collections import defaultdict
from datetime import datetime


def detect_value_drift(value_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect value drift over time
    
    Args:
        value_timeline: List of value evolution points with timestamp, category, strength
        
    Returns:
        Dictionary with drift analysis
    """
    if not value_timeline or len(value_timeline) < 2:
        return {
            "drifts": [],
            "count": 0
        }
    
    # Group by category
    by_category = defaultdict(list)
    for point in value_timeline:
        category = point.get('category', 'other')
        by_category[category].append(point)
    
    drifts = []
    
    for category, points in by_category.items():
        if len(points) < 2:
            continue
        
        # Sort by timestamp
        sorted_points = sorted(points, key=lambda p: p.get('timestamp', ''))
        
        # Compare first half vs second half
        midpoint = len(sorted_points) // 2
        first_half = sorted_points[:midpoint]
        second_half = sorted_points[midpoint:]
        
        avg_first = sum(p.get('strength', 0) for p in first_half) / len(first_half)
        avg_second = sum(p.get('strength', 0) for p in second_half) / len(second_half)
        
        diff = avg_second - avg_first
        
        if abs(diff) > 0.2:  # Significant drift threshold
            drifts.append({
                "category": category,
                "direction": "strengthening" if diff > 0 else "weakening",
                "magnitude": abs(diff),
                "period_start": first_half[0].get('timestamp'),
                "period_end": second_half[-1].get('timestamp')
            })
    
    return {
        "drifts": drifts,
        "count": len(drifts)
    }


def detect_belief_drift(belief_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect belief drift over time
    
    Args:
        belief_timeline: List of belief evolution points with timestamp, polarity, confidence
        
    Returns:
        Dictionary with drift analysis
    """
    if not belief_timeline or len(belief_timeline) < 2:
        return {
            "drifts": [],
            "count": 0
        }
    
    # Sort by timestamp
    sorted_points = sorted(belief_timeline, key=lambda p: p.get('timestamp', ''))
    
    # Compare first half vs second half
    midpoint = len(sorted_points) // 2
    first_half = sorted_points[:midpoint]
    second_half = sorted_points[midpoint:]
    
    avg_polarity_first = sum(p.get('polarity', 0) for p in first_half) / len(first_half)
    avg_polarity_second = sum(p.get('polarity', 0) for p in second_half) / len(second_half)
    
    avg_confidence_first = sum(p.get('confidence', 0) for p in first_half) / len(first_half)
    avg_confidence_second = sum(p.get('confidence', 0) for p in second_half) / len(second_half)
    
    polarity_diff = avg_polarity_second - avg_polarity_first
    confidence_diff = avg_confidence_second - avg_confidence_first
    
    drifts = []
    
    if abs(polarity_diff) > 0.3:
        drifts.append({
            "type": "polarity",
            "direction": "more_positive" if polarity_diff > 0 else "more_negative",
            "magnitude": abs(polarity_diff),
            "period_start": first_half[0].get('timestamp'),
            "period_end": second_half[-1].get('timestamp')
        })
    
    if abs(confidence_diff) > 0.3:
        drifts.append({
            "type": "confidence",
            "direction": "more_confident" if confidence_diff > 0 else "less_confident",
            "magnitude": abs(confidence_diff),
            "period_start": first_half[0].get('timestamp'),
            "period_end": second_half[-1].get('timestamp')
        })
    
    return {
        "drifts": drifts,
        "count": len(drifts)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    value_timeline = kwargs.get("value_timeline", [])
    belief_timeline = kwargs.get("belief_timeline", [])
    
    value_drift = detect_value_drift(value_timeline)
    belief_drift = detect_belief_drift(belief_timeline)
    
    return {
        "value_drift": value_drift,
        "belief_drift": belief_drift
    }

