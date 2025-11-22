"""
Influence Weight Model
Calculates weighted influence scores based on frequency, recency, and impact
"""

from typing import List, Dict, Any
from datetime import datetime, timedelta


def calculate_influence_weight(
    events: List[Dict[str, Any]],
    current_date: datetime = None
) -> Dict[str, float]:
    """
    Calculate weighted influence based on:
    - Frequency of interactions
    - Recency of interactions
    - Impact magnitude
    
    Args:
        events: List of influence events with timestamp and sentiment
        current_date: Current date for recency calculation
        
    Returns:
        Dictionary with weighted scores
    """
    if not events:
        return {
            "frequency_weight": 0.0,
            "recency_weight": 0.0,
            "impact_weight": 0.0,
            "total_weight": 0.0
        }
    
    if current_date is None:
        current_date = datetime.now()
    
    # Frequency weight (more interactions = higher weight)
    frequency_weight = min(1.0, len(events) / 20.0)  # Normalize to 0-1
    
    # Recency weight (more recent = higher weight)
    if events:
        most_recent = max(
            datetime.fromisoformat(e.get('timestamp', '').replace('Z', '+00:00'))
            for e in events
            if e.get('timestamp')
        )
        days_ago = (current_date - most_recent.replace(tzinfo=None)).days
        recency_weight = max(0.0, 1.0 - (days_ago / 90.0))  # Decay over 90 days
    else:
        recency_weight = 0.0
    
    # Impact weight (average absolute sentiment)
    sentiments = [
        abs(e.get('sentiment', 0.0))
        for e in events
        if e.get('sentiment') is not None
    ]
    impact_weight = sum(sentiments) / len(sentiments) if sentiments else 0.0
    
    # Total weight (weighted combination)
    total_weight = (
        frequency_weight * 0.3 +
        recency_weight * 0.3 +
        impact_weight * 0.4
    )
    
    return {
        "frequency_weight": frequency_weight,
        "recency_weight": recency_weight,
        "impact_weight": impact_weight,
        "total_weight": total_weight
    }


def calculate_person_influence_score(
    emotional_impact: float,
    behavioral_impact: float,
    toxicity_score: float,
    uplift_score: float,
    weight: float = 1.0
) -> float:
    """
    Calculate final influence score for a person
    
    Args:
        emotional_impact: Emotional impact score (-1 to +1)
        behavioral_impact: Behavioral impact score (-1 to +1)
        toxicity_score: Toxicity score (0 to 1)
        uplift_score: Uplift score (0 to 1)
        weight: Weight multiplier (0 to 1)
        
    Returns:
        Final influence score (-1 to +1)
    """
    # Base score
    base_score = (
        emotional_impact * 0.4 +
        behavioral_impact * 0.4 -
        toxicity_score * 0.6 +
        uplift_score * 0.3
    )
    
    # Apply weight
    weighted_score = base_score * weight
    
    # Clamp to -1 to +1
    return max(-1.0, min(1.0, weighted_score))


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    events = kwargs.get("events", [])
    emotional_impact = kwargs.get("emotional_impact", 0.0)
    behavioral_impact = kwargs.get("behavioral_impact", 0.0)
    toxicity_score = kwargs.get("toxicity_score", 0.0)
    uplift_score = kwargs.get("uplift_score", 0.0)
    
    weight_result = calculate_influence_weight(events)
    final_score = calculate_person_influence_score(
        emotional_impact,
        behavioral_impact,
        toxicity_score,
        uplift_score,
        weight_result["total_weight"]
    )
    
    return {
        "weight": weight_result,
        "final_score": final_score
    }

