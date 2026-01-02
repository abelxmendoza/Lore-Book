"""
Behavior Pattern Detection
"""

from typing import List, Dict, Any
from collections import Counter


def detect_patterns(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect negative behavioral patterns
    
    TODO: Implement sequence mining or HMM-based pattern detection
    """
    interventions = []
    
    if len(events) < 5:
        return interventions
    
    # Placeholder: Basic pattern detection
    # Extract keywords or topics from events
    negative_keywords = ['stress', 'anxiety', 'worry', 'frustrated', 'angry', 'sad', 'depressed']
    
    negative_count = 0
    for event in events[-10:]:  # Last 10 events
        content = event.get('content', '').lower()
        if any(keyword in content for keyword in negative_keywords):
            negative_count += 1
    
    # If more than 50% of recent entries contain negative keywords
    if negative_count > len(events[-10:]) * 0.5:
        interventions.append({
            "type": "negative_pattern",
            "severity": "medium",
            "confidence": 0.65,
            "message": "Detected recurring negative patterns in recent entries.",
        })
    
    return interventions

