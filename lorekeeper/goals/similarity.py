"""
Goal Similarity Detection
"""

from typing import List, Dict, Any
import numpy as np


def find_similar_goals(goal: Dict[str, Any], all_goals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Find similar goals
    
    TODO: Implement semantic similarity using embeddings
    """
    similar = []
    
    # Placeholder: Basic text similarity
    goal_text = (goal.get('title', '') + ' ' + goal.get('description', '')).lower()
    
    for other_goal in all_goals:
        if other_goal['id'] == goal['id']:
            continue
        
        other_text = (other_goal.get('title', '') + ' ' + other_goal.get('description', '')).lower()
        
        # Simple word overlap
        goal_words = set(goal_text.split())
        other_words = set(other_text.split())
        
        if goal_words and other_words:
            overlap = len(goal_words & other_words) / len(goal_words | other_words)
            if overlap > 0.3:
                similar.append({
                    'goal': other_goal,
                    'similarity': overlap,
                })
    
    return sorted(similar, key=lambda x: x['similarity'], reverse=True)[:5]

