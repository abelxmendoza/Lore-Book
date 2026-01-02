"""
Decision Pattern Detection
"""

from typing import List, Dict, Any
from collections import defaultdict


def detect_patterns(decisions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect patterns in decisions
    
    TODO: Implement advanced pattern detection using ML
    """
    patterns = []
    
    # Group by category and outcome
    category_outcome_map = defaultdict(lambda: defaultdict(int))
    
    for decision in decisions:
        category = decision.get('category', 'other')
        outcome = decision.get('outcome', 'unknown')
        category_outcome_map[category][outcome] += 1
    
    # Detect patterns
    for category, outcomes in category_outcome_map.items():
        total = sum(outcomes.values())
        if total >= 3:
            dominant_outcome = max(outcomes.items(), key=lambda x: x[1])
            percentage = (dominant_outcome[1] / total) * 100
            
            if percentage >= 70:
                patterns.append({
                    'category': category,
                    'dominant_outcome': dominant_outcome[0],
                    'percentage': percentage,
                    'total_decisions': total,
                })
    
    return patterns

