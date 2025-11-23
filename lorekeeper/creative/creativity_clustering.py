"""
Creative Event Clustering
Clusters creative events by medium, action, and patterns
"""

from typing import List, Dict, Any
from collections import defaultdict


def cluster_creative_events(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster creative events by medium and action
    
    Args:
        events: List of creative events
        
    Returns:
        Dictionary with clusters
    """
    clusters = []
    
    # Group by medium
    medium_groups = defaultdict(list)
    for event in events:
        medium = event.get('medium', 'unknown')
        medium_groups[medium].append(event)
    
    # Create clusters from medium groups
    cluster_id = 0
    for medium, medium_events in medium_groups.items():
        if len(medium_events) >= 2:
            # Group by action
            action_groups = defaultdict(list)
            for event in medium_events:
                action = event.get('action', 'worked_on')
                action_groups[action].append(event)
            
            for action, action_events in action_groups.items():
                clusters.append({
                    "id": f"cluster_{cluster_id}",
                    "medium": medium,
                    "action": action,
                    "events": action_events,
                    "count": len(action_events)
                })
                cluster_id += 1
    
    return {"clusters": clusters}


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    events = kwargs.get("events", [])
    return cluster_creative_events(events)

