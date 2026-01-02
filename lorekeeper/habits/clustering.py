"""
Habit Clustering
"""

from typing import List, Dict, Any
from datetime import datetime
from collections import defaultdict


def cluster(habits: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster habits by category, frequency, and similarity
    
    Args:
        habits: List of habits with id, action, category, frequency, streak
        
    Returns:
        Dictionary with clusters list
    """
    clusters = []
    
    # Group by category first
    category_groups = defaultdict(list)
    for habit in habits:
        category = habit.get('category', 'other')
        category_groups[category].append(habit)
    
    # Create clusters
    cluster_id = 0
    for category, category_habits in category_groups.items():
        # Further cluster by frequency if needed
        frequency_groups = defaultdict(list)
        for habit in category_habits:
            freq = habit.get('frequency', 0)
            freq_group = 'high' if freq >= 5 else 'medium' if freq >= 2 else 'low'
            frequency_groups[freq_group].append(habit)
        
        for freq_group, freq_habits in frequency_groups.items():
            for habit in freq_habits:
                cluster_id_str = f"cluster_{cluster_id}"
                clusters.append({
                    "id": f"cluster_{habit['id']}",
                    "type": "cluster_assignment",
                    "message": f'Habit "{habit["action"]}" assigned to {category} cluster ({freq_group} frequency)',
                    "confidence": 0.6,
                    "timestamp": datetime.now().isoformat(),
                    "habitId": habit['id'],
                    "habit_id": habit['id'],
                    "clusterId": cluster_id_str,
                    "cluster_id": cluster_id_str,
                })
            cluster_id += 1
    
    return {"clusters": clusters}


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    habits = kwargs.get("habits", [])
    return cluster(habits)


