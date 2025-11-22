"""
Legacy Theme Clustering
Groups legacy signals into long-term themes
"""

from typing import List, Dict, Any
from collections import defaultdict
from datetime import datetime


def cluster(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster legacy signals into themes
    
    Args:
        signals: List of legacy signals with id, text, domain, intensity, direction
        
    Returns:
        Dictionary with clusters list
    """
    clusters = []
    
    # Group by domain first
    domain_groups = defaultdict(list)
    for signal in signals:
        domain = signal.get('domain', 'other')
        domain_groups[domain].append(signal)
    
    # Create clusters from domain groups
    cluster_id = 0
    for domain, domain_signals in domain_groups.items():
        if len(domain_signals) >= 2:
            # Extract keywords from signals
            keywords = extract_keywords([s.get('text', '') for s in domain_signals])
            
            # Calculate significance
            significance = calculate_significance(domain_signals)
            
            clusters.append({
                "id": f"cluster_{cluster_id}",
                "theme": f"{domain.title()} Legacy",
                "keywords": keywords,
                "significance": significance,
                "domain": domain,
                "signal_ids": [s.get('id') for s in domain_signals],
                "signalIds": [s.get('id') for s in domain_signals],
            })
            cluster_id += 1
    
    return {"clusters": clusters}


def extract_keywords(texts: List[str]) -> List[str]:
    """
    Extract keywords from texts
    """
    keywords = []
    
    # Common legacy keywords
    legacy_keywords = [
        'legacy', 'remembered', 'forever', 'lasting', 'impact', 'influence',
        'purpose', 'meaning', 'heritage', 'tradition', 'teaching', 'mentoring',
        'creating', 'building', 'sharing', 'passing on'
    ]
    
    # Check which keywords appear in texts
    text_combined = ' '.join(texts).lower()
    for keyword in legacy_keywords:
        if keyword in text_combined:
            keywords.append(keyword)
    
    # Add domain-specific keywords
    if 'tech' in text_combined or 'code' in text_combined or 'software' in text_combined:
        keywords.append('technology')
    if 'art' in text_combined or 'creative' in text_combined or 'craft' in text_combined:
        keywords.append('creativity')
    if 'family' in text_combined or 'heritage' in text_combined:
        keywords.append('heritage')
    if 'teach' in text_combined or 'mentor' in text_combined:
        keywords.append('teaching')
    
    return keywords[:10]  # Limit to 10 keywords


def calculate_significance(signals: List[Dict[str, Any]]) -> float:
    """
    Calculate significance of a cluster
    """
    if not signals:
        return 0.0
    
    positive = sum(1 for s in signals if s.get('direction', 1) == 1)
    negative = sum(1 for s in signals if s.get('direction', 1) == -1)
    
    avg_intensity = sum(s.get('intensity', 0) for s in signals) / len(signals)
    
    # Significance based on signal count, intensity, and direction
    direction_score = (positive - negative) / len(signals)
    significance = (avg_intensity + direction_score) / 2
    
    return max(0.0, min(1.0, significance))


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    signals = kwargs.get("signals", [])
    return cluster(signals)

