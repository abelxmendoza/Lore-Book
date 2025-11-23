"""
Belief Graph Mapping
Maps belief associations and relationships
"""

from typing import List, Dict, Any
from collections import defaultdict


def build_belief_graph(beliefs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build belief association graph
    
    Args:
        beliefs: List of belief signals with statement, polarity, confidence
        
    Returns:
        Dictionary with belief graph data
    """
    # Extract keywords from beliefs
    belief_keywords = defaultdict(list)
    
    for belief in beliefs:
        statement = belief.get('statement', '').lower()
        # Simple keyword extraction (in production, use NLP)
        keywords = extract_keywords(statement)
        
        for keyword in keywords:
            belief_keywords[keyword].append(belief)
    
    # Build associations (beliefs that share keywords)
    associations = []
    keywords_list = list(belief_keywords.keys())
    
    for i, keyword1 in enumerate(keywords_list):
        for keyword2 in keywords_list[i+1:]:
            beliefs1 = belief_keywords[keyword1]
            beliefs2 = belief_keywords[keyword2]
            
            # Find shared beliefs
            shared = [b for b in beliefs1 if b in beliefs2]
            
            if shared:
                associations.append({
                    "keyword1": keyword1,
                    "keyword2": keyword2,
                    "shared_beliefs": len(shared),
                    "strength": len(shared) / max(len(beliefs1), len(beliefs2))
                })
    
    return {
        "belief_keywords": dict(belief_keywords),
        "associations": associations,
        "total_beliefs": len(beliefs),
        "unique_keywords": len(belief_keywords)
    }


def extract_keywords(text: str) -> List[str]:
    """
    Extract keywords from text (simplified)
    """
    # Common stop words
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'}
    
    # Simple word extraction
    words = text.split()
    keywords = [w.lower().strip('.,!?;:') for w in words if w.lower() not in stop_words and len(w) > 3]
    
    return keywords[:10]  # Limit to 10 keywords


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    beliefs = kwargs.get("beliefs", [])
    return build_belief_graph(beliefs)

