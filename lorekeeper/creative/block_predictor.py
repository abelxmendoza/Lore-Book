"""
Creative Block Predictor
Predicts likelihood of creative blocks
"""

from typing import List, Dict, Any
from collections import defaultdict


def predict_blocks(events: List[Dict[str, Any]], blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Predict likelihood of creative blocks
    
    Args:
        events: List of creative events
        blocks: List of detected blocks
        
    Returns:
        Dictionary with block predictions
    """
    if len(events) == 0:
        return {
            "block_risk": 0.5,
            "risk_factors": [],
            "confidence": 0
        }
    
    risk_factors = []
    risk_score = 0.0
    
    # Check for decreasing activity
    if len(events) >= 4:
        sorted_events = sorted(events, key=lambda e: e.get('timestamp', ''))
        first_half = sorted_events[:len(sorted_events)//2]
        second_half = sorted_events[len(sorted_events)//2:]
        
        if len(second_half) < len(first_half) * 0.5:
            risk_score += 0.3
            risk_factors.append("decreasing_activity")
    
    # Check for unresolved blocks
    unresolved_blocks = [b for b in blocks if not b.get('resolved', False)]
    if len(unresolved_blocks) > 0:
        risk_score += 0.4
        risk_factors.append("unresolved_blocks")
    
    # Check for block frequency
    if len(blocks) > len(events) * 0.3:
        risk_score += 0.3
        risk_factors.append("high_block_frequency")
    
    risk_score = min(1.0, risk_score)
    confidence = min(1.0, (len(events) + len(blocks)) / 20)
    
    return {
        "block_risk": risk_score,
        "risk_factors": risk_factors,
        "confidence": confidence,
        "unresolved_count": len(unresolved_blocks)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    events = kwargs.get("events", [])
    blocks = kwargs.get("blocks", [])
    return predict_blocks(events, blocks)

