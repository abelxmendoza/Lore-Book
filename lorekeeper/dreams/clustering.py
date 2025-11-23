"""
Dream Theme Clustering
Groups dream signals into themes using clustering
"""

from typing import List, Dict, Any
from collections import defaultdict


def cluster_dream_themes(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster dream signals by category
    
    Args:
        signals: List of dream signals with category, clarity, desire, text
        
    Returns:
        Dictionary with clusters
    """
    clusters = []
    
    # Group by category first
    category_groups = defaultdict(list)
    for signal in signals:
        category = signal.get('category', 'other')
        category_groups[category].append(signal)
    
    # Create clusters from category groups
    cluster_id = 0
    for category, category_signals in category_groups.items():
        if len(category_signals) >= 2:
            # Calculate cluster metrics
            total_clarity = sum(s.get('clarity', 0) for s in category_signals)
            total_desire = sum(s.get('desire', 0) for s in category_signals)
            avg_clarity = total_clarity / len(category_signals)
            avg_desire = total_desire / len(category_signals)
            total_score = total_clarity + total_desire
            
            clusters.append({
                "id": f"cluster_{cluster_id}",
                "category": category,
                "signals": category_signals,
                "count": len(category_signals),
                "average_clarity": avg_clarity,
                "average_desire": avg_desire,
                "total_score": total_score
            })
            cluster_id += 1
    
    return {"clusters": clusters}


def detect_core_dreams(clusters: List[Dict[str, Any]], top_n: int = 4) -> List[str]:
    """
    Detect core dreams from clusters
    
    Args:
        clusters: List of dream clusters
        top_n: Number of top dreams to return
        
    Returns:
        List of core dream categories
    """
    # Sort by total score (clarity + desire)
    sorted_clusters = sorted(clusters, key=lambda c: c.get('total_score', 0), reverse=True)
    
    core_dreams = [c.get('category') for c in sorted_clusters[:top_n]]
    
    return core_dreams


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    signals = kwargs.get("signals", [])
    clusters_result = cluster_dream_themes(signals)
    clusters = clusters_result.get("clusters", [])
    core_dreams = detect_core_dreams(clusters)
    
    return {
        "clusters": clusters,
        "core_dreams": core_dreams
    }

