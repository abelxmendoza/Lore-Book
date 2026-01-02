"""
Long-Term Legacy Progression Model
Models multi-year legacy progression
"""

from typing import List, Dict, Any
from datetime import datetime, timedelta
import numpy as np


def model_progression(trajectory_points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Model long-term legacy progression
    
    Args:
        trajectory_points: List of trajectory points with timestamp and significance
        
    Returns:
        Dictionary with progression analysis
    """
    if not trajectory_points or len(trajectory_points) < 2:
        return {
            "trend": "insufficient_data",
            "projected_significance": 0.0,
            "growth_rate": 0.0
        }
    
    # Sort by timestamp
    sorted_points = sorted(trajectory_points, key=lambda p: p.get('timestamp', ''))
    
    # Extract values
    significances = [p.get('significance', 0) for p in sorted_points]
    
    # Calculate trend using linear regression
    x = np.arange(len(significances))
    y = np.array(significances)
    
    # Linear regression
    n = len(x)
    sum_x = np.sum(x)
    sum_y = np.sum(y)
    sum_xy = np.sum(x * y)
    sum_x_squared = np.sum(x ** 2)
    
    denominator = n * sum_x_squared - sum_x ** 2
    if denominator == 0:
        slope = 0.0
    else:
        slope = (n * sum_xy - sum_x * sum_y) / denominator
    
    intercept = (sum_y - slope * sum_x) / n
    
    # Project future significance (1 year ahead)
    future_x = len(significances) + 12  # Assuming monthly data points
    projected = slope * future_x + intercept
    
    # Determine trend
    if slope > 0.01:
        trend = "strengthening"
    elif slope < -0.01:
        trend = "weakening"
    else:
        trend = "stable"
    
    return {
        "trend": trend,
        "projected_significance": float(max(0, min(1, projected))),
        "growth_rate": float(slope),
        "current_significance": float(significances[-1]),
        "intercept": float(intercept)
    }


def detect_legacy_phases(trajectory_points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect phases in legacy progression
    
    TODO: Implement phase detection (foundation, growth, maturity, decline)
    """
    phases = []
    
    if not trajectory_points or len(trajectory_points) < 3:
        return phases
    
    # Simple phase detection based on trend changes
    sorted_points = sorted(trajectory_points, key=lambda p: p.get('timestamp', ''))
    significances = [p.get('significance', 0) for p in sorted_points]
    
    # Detect phase transitions
    for i in range(1, len(significances) - 1):
        prev = significances[i - 1]
        curr = significances[i]
        next_val = significances[i + 1]
        
        # Phase transition if trend changes
        if (prev < curr < next_val) or (prev > curr > next_val):
            phases.append({
                "timestamp": sorted_points[i].get('timestamp'),
                "type": "growth" if curr > prev else "decline",
                "significance": float(curr)
            })
    
    return phases


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    trajectory_points = kwargs.get("trajectory_points", [])
    
    progression = model_progression(trajectory_points)
    phases = detect_legacy_phases(trajectory_points)
    
    return {
        "progression": progression,
        "phases": phases
    }

