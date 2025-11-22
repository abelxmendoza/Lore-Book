"""
Stress → Recovery Curve Modeling
Builds stress and recovery curves over time
"""

from typing import List, Dict, Any
import numpy as np
from datetime import datetime


def build_stress_curve(setbacks: List[Dict[str, Any]], entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build stress curve from setbacks and entries
    
    Args:
        setbacks: List of setback signals
        entries: List of journal entries
        
    Returns:
        Dictionary with stress curve data
    """
    if not setbacks:
        return {
            "stress_curve": [],
            "recovery_curve": [],
            "baseline": 0.0
        }
    
    # Create time series
    stress_points = []
    recovery_points = []
    
    for setback in setbacks:
        setback_time = setback.get("timestamp", "")
        severity = setback.get("severity", 0.0)
        
        stress_points.append({
            "timestamp": setback_time,
            "stress": severity
        })
        
        # Find recovery after setback
        recovery = find_recovery_after_setback(setback, entries)
        if recovery:
            recovery_points.append({
                "timestamp": recovery.get("timestamp", setback_time),
                "recovery": recovery.get("improvement", 0.0),
                "setback_timestamp": setback_time
            })
    
    # Calculate baseline (average stress when no setbacks)
    baseline = calculate_baseline_stress(entries, setbacks)
    
    return {
        "stress_curve": stress_points,
        "recovery_curve": recovery_points,
        "baseline": baseline
    }


def find_recovery_after_setback(setback: Dict[str, Any], entries: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    """
    Find recovery signal after a setback
    """
    setback_time = setback.get("timestamp", "")
    if not setback_time:
        return None
    
    # Find entries after setback
    after_entries = [
        e for e in entries
        if (e.get("timestamp") or e.get("date") or e.get("created_at", "")) > setback_time
    ]
    
    if not after_entries:
        return None
    
    # Find best sentiment after setback
    best_sentiment = -1.0
    best_entry = None
    
    for entry in after_entries:
        sentiment = entry.get("sentiment", -1.0)
        if sentiment > best_sentiment:
            best_sentiment = sentiment
            best_entry = entry
    
    if best_entry and best_sentiment > -0.5:
        return {
            "timestamp": best_entry.get("timestamp") or best_entry.get("date") or best_entry.get("created_at", ""),
            "improvement": (best_sentiment + 1) / 2,  # Normalize to 0-1
            "sentiment": best_sentiment
        }
    
    return None


def calculate_baseline_stress(entries: List[Dict[str, Any]], setbacks: List[Dict[str, Any]]) -> float:
    """
    Calculate baseline stress level (when no active setbacks)
    """
    if not entries:
        return 0.0
    
    # Get sentiments from entries not during setbacks
    setback_times = {s.get("timestamp", "") for s in setbacks}
    
    baseline_sentiments = []
    for entry in entries:
        entry_time = entry.get("timestamp") or entry.get("date") or entry.get("created_at", "")
        if entry_time not in setback_times:
            sentiment = entry.get("sentiment", 0.0)
            baseline_sentiments.append(sentiment)
    
    if not baseline_sentiments:
        return 0.0
    
    # Baseline is average sentiment (inverted for stress: negative sentiment = higher stress)
    avg_sentiment = sum(baseline_sentiments) / len(baseline_sentiments)
    baseline_stress = max(0.0, (1 - avg_sentiment) / 2)  # Normalize to 0-1
    
    return baseline_stress


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    setbacks = kwargs.get("setbacks", [])
    entries = kwargs.get("entries", [])
    
    return build_stress_curve(setbacks, entries)

