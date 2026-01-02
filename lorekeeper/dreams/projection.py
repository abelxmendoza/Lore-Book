"""
Long-Term Ambition Projection
Projects future dream trajectory based on historical patterns
"""

from typing import List, Dict, Any
import numpy as np
from datetime import datetime


def project_future_dreams(dream_timeline: List[Dict[str, Any]], years_ahead: int = 5) -> Dict[str, Any]:
    """
    Project future dream trajectory
    
    Args:
        dream_timeline: List of dream trajectory points with timestamp, clarity, desire, category
        years_ahead: Number of years to project ahead
        
    Returns:
        Dictionary with future projections
    """
    if not dream_timeline or len(dream_timeline) < 2:
        return {
            "projections": [],
            "confidence": 0.0
        }
    
    # Group by category
    by_category = {}
    for point in dream_timeline:
        category = point.get('category', 'other')
        if category not in by_category:
            by_category[category] = []
        by_category[category].append(point)
    
    projections = []
    
    for category, points in by_category.items():
        if len(points) < 2:
            continue
        
        # Sort by timestamp
        sorted_points = sorted(points, key=lambda p: p.get('timestamp', ''))
        
        # Extract clarity and desire values
        clarities = [p.get('clarity', 0) for p in sorted_points]
        desires = [p.get('desire', 0) for p in sorted_points]
        
        # Simple linear projection
        x = np.arange(len(clarities))
        
        # Project clarity
        clarity_slope = (clarities[-1] - clarities[0]) / len(clarities) if len(clarities) > 1 else 0
        projected_clarity = min(1.0, max(0.0, clarities[-1] + clarity_slope * years_ahead))
        
        # Project desire
        desire_slope = (desires[-1] - desires[0]) / len(desires) if len(desires) > 1 else 0
        projected_desire = min(1.0, max(0.0, desires[-1] + desire_slope * years_ahead))
        
        # Calculate confidence based on data consistency
        clarity_variance = np.var(clarities) if len(clarities) > 1 else 0
        desire_variance = np.var(desires) if len(desires) > 1 else 0
        confidence = max(0.0, min(1.0, 1.0 - (clarity_variance + desire_variance) / 2))
        
        projections.append({
            "category": category,
            "projected_clarity": float(projected_clarity),
            "projected_desire": float(projected_desire),
            "confidence": float(confidence),
            "years_ahead": years_ahead
        })
    
    return {
        "projections": projections,
        "confidence": float(np.mean([p.get('confidence', 0) for p in projections])) if projections else 0.0
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    dream_timeline = kwargs.get("dream_timeline", [])
    years_ahead = kwargs.get("years_ahead", 5)
    
    return project_future_dreams(dream_timeline, years_ahead)

