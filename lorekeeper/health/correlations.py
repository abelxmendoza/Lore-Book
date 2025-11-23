"""
Health Correlations Analysis
Computes correlations between health metrics
"""

from typing import List, Dict, Any
import statistics


def compute_correlation(x: List[float], y: List[float]) -> float:
    """
    Compute Pearson correlation coefficient
    
    Args:
        x: First variable
        y: Second variable
        
    Returns:
        Correlation coefficient (-1 to 1)
    """
    if len(x) != len(y) or len(x) < 2:
        return 0.0
    
    x_mean = statistics.mean(x)
    y_mean = statistics.mean(y)
    
    numerator = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(len(x)))
    x_variance = sum((x[i] - x_mean) ** 2 for i in range(len(x)))
    y_variance = sum((y[i] - y_mean) ** 2 for i in range(len(y)))
    
    denominator = (x_variance * y_variance) ** 0.5
    
    if denominator == 0:
        return 0.0
    
    return numerator / denominator


def analyze_correlations(metrics: Dict[str, List[float]]) -> Dict[str, Any]:
    """
    Analyze correlations between multiple health metrics
    
    Args:
        metrics: Dictionary of metric names to values
        
    Returns:
        Dictionary with correlation matrix
    """
    metric_names = list(metrics.keys())
    correlations = {}
    
    for i, name1 in enumerate(metric_names):
        for name2 in metric_names[i+1:]:
            corr = compute_correlation(metrics[name1], metrics[name2])
            key = f"{name1}_{name2}"
            correlations[key] = corr
    
    return {
        "correlations": correlations,
        "metric_names": metric_names
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    metrics = kwargs.get("metrics", {})
    return analyze_correlations(metrics)

