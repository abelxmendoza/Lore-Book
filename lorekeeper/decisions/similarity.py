"""
Decision Similarity Analysis
"""

from typing import List, Dict, Any
from datetime import datetime
from difflib import SequenceMatcher


def similarity_score(str1: str, str2: str) -> float:
    """Calculate similarity between two strings"""
    return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()


def analyze(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze similarity between decisions
    
    Args:
        decisions: List of decisions with id, description, category, outcome
        
    Returns:
        Dictionary with matches list
    """
    matches = []
    
    # Compare each decision with others
    for i, decision1 in enumerate(decisions):
        similar_decisions = []
        
        for j, decision2 in enumerate(decisions):
            if i >= j:  # Avoid duplicate comparisons
                continue
            
            # Calculate similarity
            desc1 = decision1.get('description', '')
            desc2 = decision2.get('description', '')
            
            if not desc1 or not desc2:
                continue
            
            # Check category match
            category_match = decision1.get('category') == decision2.get('category')
            
            # Calculate description similarity
            desc_similarity = similarity_score(desc1, desc2)
            
            # Combined similarity score
            similarity = desc_similarity
            if category_match:
                similarity += 0.2  # Boost for same category
            
            # If similarity is significant
            if similarity >= 0.4:
                similar_decisions.append({
                    'decision_id': decision2.get('id'),
                    'similarity_score': similarity,
                })
        
        # Create match insights for decisions with similar ones
        if similar_decisions:
            # Sort by similarity
            similar_decisions.sort(key=lambda x: x['similarity_score'], reverse=True)
            
            # Take top 3 most similar
            top_similar = similar_decisions[:3]
            
            matches.append({
                "id": f"sim_{decision1['id']}",
                "type": "similar_decision",
                "message": f'Found {len(similar_decisions)} similar decision(s) for "{desc1[:50]}..."',
                "confidence": min(0.9, 0.5 + (top_similar[0]['similarity_score'] * 0.4)),
                "timestamp": datetime.now().isoformat(),
                "decisionId": decision1.get('id'),
                "decision_id": decision1.get('id'),
                "similar_decision_id": top_similar[0]['decision_id'],
                "similarity_score": top_similar[0]['similarity_score'],
            })
    
    return {"matches": matches}


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    decisions = kwargs.get("decisions", [])
    return analyze(decisions)

