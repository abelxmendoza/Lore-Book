"""
Slope Estimator for Recovery Speed
Estimates recovery speed using linear regression
"""

from typing import List, Dict, Any
import numpy as np


def estimate_recovery_slope(recovery_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Estimate recovery slope using linear regression
    
    Args:
        recovery_data: List of recovery points with timestamp and improvement
        
    Returns:
        Dictionary with slope estimation
    """
    if not recovery_data or len(recovery_data) < 2:
        return {
            "slope": 0.0,
            "intercept": 0.0,
            "recovery_speed": 0.0,
            "r_squared": 0.0
        }
    
    # Extract values
    improvements = [r.get("improvement", 0.0) for r in recovery_data]
    
    # Create time indices (days since first recovery)
    timestamps = [r.get("timestamp", "") for r in recovery_data]
    if not timestamps[0]:
        return {
            "slope": 0.0,
            "intercept": 0.0,
            "recovery_speed": 0.0,
            "r_squared": 0.0
        }
    
    try:
        from datetime import datetime
        first_time = datetime.fromisoformat(timestamps[0].replace('Z', '+00:00'))
        time_indices = []
        for ts in timestamps:
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                days = (dt - first_time).total_seconds() / (24 * 3600)
                time_indices.append(days)
            except:
                time_indices.append(len(time_indices))
    except:
        # Fallback: use index as time
        time_indices = list(range(len(recovery_data)))
    
    # Linear regression
    x = np.array(time_indices)
    y = np.array(improvements)
    
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
    
    # Calculate R-squared
    y_pred = slope * x + intercept
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - np.mean(y)) ** 2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    
    # Recovery speed: slope normalized to 0-1 (positive slope = faster recovery)
    recovery_speed = max(0.0, min(1.0, (slope + 1) / 2))
    
    return {
        "slope": float(slope),
        "intercept": float(intercept),
        "recovery_speed": float(recovery_speed),
        "r_squared": float(r_squared)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    recovery_data = kwargs.get("recovery_data", [])
    return estimate_recovery_slope(recovery_data)

