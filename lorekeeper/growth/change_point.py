"""
Change Point Detection
Detects significant changes in growth trajectory
"""

from typing import List, Dict, Any


def detect_change_points(values: List[float], threshold: float = 0.2) -> List[Dict[str, Any]]:
    """
    Detect change points in growth trajectory
    
    Args:
        values: List of growth values
        threshold: Minimum change magnitude to consider
        
    Returns:
        List of change points with indices and magnitudes
    """
    if not values or len(values) < 2:
        return []
    
    change_points = []
    
    for i in range(1, len(values)):
        change = values[i] - values[i-1]
        abs_change = abs(change)
        
        if abs_change >= threshold:
            change_points.append({
                "index": i,
                "magnitude": float(change),
                "type": "breakthrough" if change > 0 else "regression",
                "from_value": float(values[i-1]),
                "to_value": float(values[i])
            })
    
    return change_points


def detect_plateau(values: List[float], window_size: int = 3, threshold: float = 0.05) -> bool:
    """
    Detect if values are in a plateau
    
    Args:
        values: List of growth values
        window_size: Number of recent values to check
        threshold: Maximum variation to consider flat
        
    Returns:
        True if plateau detected
    """
    if not values or len(values) < window_size:
        return False
    
    recent = values[-window_size:]
    value_range = max(recent) - min(recent)
    
    return value_range < threshold


def detect_breakthrough(values: List[float], threshold: float = 0.2) -> bool:
    """
    Detect if there's a breakthrough (sudden positive jump)
    
    Args:
        values: List of growth values
        threshold: Minimum jump to consider breakthrough
        
    Returns:
        True if breakthrough detected
    """
    if not values or len(values) < 2:
        return False
    
    change = values[-1] - values[-2]
    return change >= threshold


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    values = kwargs.get("values", [])
    threshold = kwargs.get("threshold", 0.2)
    
    change_points = detect_change_points(values, threshold)
    is_plateau = detect_plateau(values)
    is_breakthrough = detect_breakthrough(values, threshold)
    
    return {
        "change_points": change_points,
        "is_plateau": is_plateau,
        "is_breakthrough": is_breakthrough,
        "total_change_points": len(change_points)
    }

