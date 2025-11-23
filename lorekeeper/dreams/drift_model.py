"""
Dream Drift Detection
Detects shifts in dreams and aspirations over time
"""

from typing import List, Dict, Any
from collections import defaultdict
from datetime import datetime


def detect_dream_drift(dream_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect dream drift over time
    
    Args:
        dream_timeline: List of dream evolution points with timestamp, category, clarity, desire
        
    Returns:
        Dictionary with drift analysis
    """
    if not dream_timeline or len(dream_timeline) < 2:
        return {
            "drifts": [],
            "count": 0
        }
    
    # Group by category
    by_category = defaultdict(list)
    for point in dream_timeline:
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
        
        avg_clarity_first = sum(p.get('clarity', 0) for p in first_half) / len(first_half)
        avg_clarity_last = sum(p.get('clarity', 0) for p in second_half) / len(second_half)
        
        avg_desire_first = sum(p.get('desire', 0) for p in first_half) / len(first_half)
        avg_desire_last = sum(p.get('desire', 0) for p in second_half) / len(second_half)
        
        clarity_diff = avg_clarity_last - avg_clarity_first
        desire_diff = avg_desire_last - avg_desire_first
        
        # Detect significant drift
        if abs(clarity_diff) > 0.2 or abs(desire_diff) > 0.2:
            drifts.append({
                "category": category,
                "clarity_drift": float(clarity_diff),
                "desire_drift": float(desire_diff),
                "direction": "strengthening" if (clarity_diff > 0 or desire_diff > 0) else "weakening",
                "magnitude": max(abs(clarity_diff), abs(desire_diff)),
                "period_start": first_half[0].get('timestamp'),
                "period_end": second_half[-1].get('timestamp')
            })
    
    return {
        "drifts": drifts,
        "count": len(drifts)
    }


def detect_category_shifts(evolution: Dict[str, List[str]]) -> Dict[str, Any]:
    """
    Detect category shifts in dream evolution
    
    Args:
        evolution: Dictionary mapping years to lists of categories
        
    Returns:
        Dictionary with shift analysis
    """
    if not evolution or len(evolution) < 2:
        return {
            "shifts": [],
            "count": 0
        }
    
    years = sorted(evolution.keys())
    first_year_categories = set(evolution[years[0]])
    last_year_categories = set(evolution[years[-1]])
    
    emerging = last_year_categories - first_year_categories
    disappearing = first_year_categories - last_year_categories
    
    shifts = []
    
    for category in emerging:
        shifts.append({
            "category": category,
            "shift": "emerging",
            "first_year": years[-1],
            "last_year": years[-1]
        })
    
    for category in disappearing:
        shifts.append({
            "category": category,
            "shift": "disappearing",
            "first_year": years[0],
            "last_year": years[0]
        })
    
    return {
        "shifts": shifts,
        "count": len(shifts)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    dream_timeline = kwargs.get("dream_timeline", [])
    evolution = kwargs.get("evolution", {})
    
    drift = detect_dream_drift(dream_timeline)
    shifts = detect_category_shifts(evolution)
    
    return {
        "drift": drift,
        "shifts": shifts
    }

