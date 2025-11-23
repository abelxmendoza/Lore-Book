"""
Value Statement Clustering
Groups value statements into themes using clustering
"""

from typing import List, Dict, Any
from collections import defaultdict


def cluster_value_statements(signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster value signals by category
    
    Args:
        signals: List of value signals with category, strength, text
        
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
            # Calculate cluster strength
            total_strength = sum(s.get('strength', 0) for s in category_signals)
            avg_strength = total_strength / len(category_signals)
            
            clusters.append({
                "id": f"cluster_{cluster_id}",
                "category": category,
                "signals": category_signals,
                "count": len(category_signals),
                "average_strength": avg_strength,
                "total_strength": total_strength
            })
            cluster_id += 1
    
    return {"clusters": clusters}


def detect_core_values(clusters: List[Dict[str, Any]], top_n: int = 5) -> List[str]:
    """
    Detect core values from clusters
    
    Args:
        clusters: List of value clusters
        top_n: Number of top values to return
        
    Returns:
        List of core value categories
    """
    # Sort by total strength
    sorted_clusters = sorted(clusters, key=lambda c: c.get('total_strength', 0), reverse=True)
    
    core_values = [c.get('category') for c in sorted_clusters[:top_n]]
    
    return core_values


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    signals = kwargs.get("signals", [])
    clusters_result = cluster_value_statements(signals)
    clusters = clusters_result.get("clusters", [])
    core_values = detect_core_values(clusters)
    
    return {
        "clusters": clusters,
        "core_values": core_values
    }

