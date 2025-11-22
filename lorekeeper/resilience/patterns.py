"""
Resilience Pattern Detection
"""

from typing import List, Dict, Any
from collections import defaultdict


def detect_resilience_patterns(setbacks: List[Dict[str, Any]], recoveries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect patterns in resilience
    
    Args:
        setbacks: List of setbacks with severity and category
        recoveries: List of recovery events
        
    Returns:
        List of detected patterns
    """
    patterns = []
    
    # Group setbacks by category
    category_setbacks = defaultdict(list)
    for setback in setbacks:
        category = setback.get('category', 'other')
        category_setbacks[category].append(setback)
    
    # Detect category-specific patterns
    for category, category_setbacks_list in category_setbacks.items():
        if len(category_setbacks_list) >= 3:
            # Check recovery rate for this category
            category_recoveries = [r for r in recoveries if r.get('category') == category]
            recovery_rate = len(category_recoveries) / len(category_setbacks_list) if category_setbacks_list else 0
            
            if recovery_rate >= 0.8:
                patterns.append({
                    "type": "strong_category_resilience",
                    "category": category,
                    "recovery_rate": recovery_rate,
                    "message": f"Strong resilience in {category} category"
                })
            elif recovery_rate < 0.5:
                patterns.append({
                    "type": "weak_category_resilience",
                    "category": category,
                    "recovery_rate": recovery_rate,
                    "message": f"Lower resilience in {category} category"
                })
    
    # Detect severity patterns
    severity_recovery = defaultdict(lambda: {"setbacks": 0, "recoveries": 0})
    for setback in setbacks:
        severity = setback.get('severity', 'low')
        severity_recovery[severity]["setbacks"] += 1
    
    for recovery in recoveries:
        # Try to match recovery to setback by severity
        # This is simplified - in practice you'd match by setback_id
        severity_recovery["all"]["recoveries"] += 1
    
    return patterns


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    setbacks = kwargs.get("setbacks", [])
    recoveries = kwargs.get("recoveries", [])
    patterns = detect_resilience_patterns(setbacks, recoveries)
    return {"patterns": patterns}

