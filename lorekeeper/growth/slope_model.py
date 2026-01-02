"""
Slope Model for Growth Velocity
Calculates growth slopes and trends
"""

from typing import List, Dict, Any
import numpy as np


def calculate_slope(values: List[float], timestamps: List[str] = None) -> Dict[str, Any]:
    """
    Calculate slope of growth trajectory
    
    Args:
        values: List of growth values over time
        timestamps: Optional list of timestamps
        
    Returns:
        Dictionary with slope analysis
    """
    if not values or len(values) < 2:
        return {
            "slope": 0.0,
            "trend": "insufficient_data",
            "r_squared": 0.0
        }
    
    # Convert to numpy array
    y = np.array(values)
    x = np.arange(len(y))
    
    # Calculate linear regression slope
    n = len(x)
    sum_x = np.sum(x)
    sum_y = np.sum(y)
    sum_xy = np.sum(x * y)
    sum_x_squared = np.sum(x ** 2)
    
    # Slope formula: (n*sum(xy) - sum(x)*sum(y)) / (n*sum(x²) - sum(x)²)
    denominator = n * sum_x_squared - sum_x ** 2
    if denominator == 0:
        slope = 0.0
    else:
        slope = (n * sum_xy - sum_x * sum_y) / denominator
    
    # Calculate R-squared (coefficient of determination)
    y_mean = np.mean(y)
    ss_tot = np.sum((y - y_mean) ** 2)
    if ss_tot == 0:
        r_squared = 1.0
    else:
        y_pred = slope * x + (sum_y - slope * sum_x) / n
        ss_res = np.sum((y - y_pred) ** 2)
        r_squared = 1 - (ss_res / ss_tot)
    
    # Determine trend
    if slope > 0.01:
        trend = "growing"
    elif slope < -0.01:
        trend = "declining"
    else:
        trend = "stable"
    
    return {
        "slope": float(slope),
        "trend": trend,
        "r_squared": float(r_squared),
        "strength": "strong" if abs(r_squared) > 0.7 else "moderate" if abs(r_squared) > 0.4 else "weak"
    }


def calculate_velocity(values: List[float], timestamps: List[str] = None) -> float:
    """
    Calculate growth velocity (rate of change)
    
    Args:
        values: List of growth values
        timestamps: Optional list of timestamps for time-based calculation
        
    Returns:
        Average velocity
    """
    if not values or len(values) < 2:
        return 0.0
    
    # Calculate differences
    deltas = [values[i] - values[i-1] for i in range(1, len(values))]
    
    # Average velocity
    velocity = sum(deltas) / len(deltas)
    
    return float(velocity)


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    values = kwargs.get("values", [])
    timestamps = kwargs.get("timestamps", [])
    
    slope_result = calculate_slope(values, timestamps)
    velocity = calculate_velocity(values, timestamps)
    
    return {
        "slope": slope_result,
        "velocity": velocity
    }

