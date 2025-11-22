"""
Emotional Recovery Analysis
"""

from typing import List, Dict, Any


def analyze_emotional_recovery(sentiments: List[float]) -> Dict[str, Any]:
    """
    Analyze emotional recovery from sentiment trend
    
    Args:
        sentiments: List of sentiment values over time
        
    Returns:
        Dictionary with recovery analysis
    """
    if not sentiments or len(sentiments) < 2:
        return {
            "recovered": False,
            "confidence": 0.0,
            "trend": "insufficient_data"
        }
    
    # Check if trend is rising
    rising = all(sentiments[i] <= sentiments[i+1] for i in range(len(sentiments)-1))
    
    # Calculate improvement
    initial = sentiments[0]
    final = sentiments[-1]
    improvement = final - initial
    
    # Determine recovery status
    recovered = rising and improvement > 0
    
    # Calculate confidence based on consistency
    if len(sentiments) >= 3:
        # Check consistency of rise
        consistent_rise = sum(1 for i in range(len(sentiments)-1) if sentiments[i+1] > sentiments[i])
        consistency_ratio = consistent_rise / (len(sentiments) - 1)
        confidence = min(0.95, 0.5 + consistency_ratio * 0.45)
    else:
        confidence = 0.75 if recovered else 0.5
    
    return {
        "recovered": recovered,
        "confidence": confidence,
        "trend": "rising" if rising else "declining" if improvement < 0 else "stable",
        "improvement": improvement,
        "initial_sentiment": initial,
        "final_sentiment": final
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    sentiments = kwargs.get("sentiments", [])
    return analyze_emotional_recovery(sentiments)

