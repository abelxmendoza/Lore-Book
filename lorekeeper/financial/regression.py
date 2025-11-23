"""
Financial Regression Analysis
Predicts financial trends using regression
"""

from typing import List, Dict, Any
import statistics


def predict_trend(values: List[float]) -> Dict[str, Any]:
    """
    Predict trend using simple linear regression
    
    Args:
        values: List of numeric values over time
        
    Returns:
        Dictionary with trend prediction
    """
    if len(values) < 2:
        return {"trend": "stable", "slope": 0, "confidence": 0}
    
    # Simple linear regression
    n = len(values)
    x = list(range(n))
    y = values
    
    x_mean = statistics.mean(x)
    y_mean = statistics.mean(y)
    
    numerator = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(n))
    denominator = sum((x[i] - x_mean) ** 2 for i in range(n))
    
    if denominator == 0:
        slope = 0
    else:
        slope = numerator / denominator
    
    # Determine trend
    if slope > 0.01:
        trend = "increasing"
    elif slope < -0.01:
        trend = "decreasing"
    else:
        trend = "stable"
    
    confidence = min(1.0, n / 10)  # More data = higher confidence
    
    return {
        "trend": trend,
        "slope": slope,
        "confidence": confidence
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    values = kwargs.get("values", [])
    return predict_trend(values)

