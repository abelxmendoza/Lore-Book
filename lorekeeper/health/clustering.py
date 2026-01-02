"""
Health Event Clustering
Clusters symptoms, sleep, and energy events into patterns
"""

from typing import List, Dict, Any
from collections import defaultdict


def cluster_symptoms(symptoms: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster symptoms by type and intensity
    
    Args:
        symptoms: List of symptom events with type, intensity, timestamp
        
    Returns:
        Dictionary with clusters
    """
    clusters = []
    
    # Group by type first
    type_groups = defaultdict(list)
    for symptom in symptoms:
        symptom_type = symptom.get('type', 'unknown')
        type_groups[symptom_type].append(symptom)
    
    # Create clusters from type groups
    cluster_id = 0
    for symptom_type, type_symptoms in type_groups.items():
        if len(type_symptoms) >= 2:
            # Calculate cluster metrics
            total_intensity = sum(s.get('intensity', 0) for s in type_symptoms)
            avg_intensity = total_intensity / len(type_symptoms)
            
            clusters.append({
                "id": f"cluster_{cluster_id}",
                "type": symptom_type,
                "symptoms": type_symptoms,
                "count": len(type_symptoms),
                "average_intensity": avg_intensity,
                "total_intensity": total_intensity
            })
            cluster_id += 1
    
    return {"clusters": clusters}


def cluster_health_events(symptoms: List[Dict[str, Any]], 
                          sleep: List[Dict[str, Any]], 
                          energy: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster all health events together
    
    Args:
        symptoms: List of symptom events
        sleep: List of sleep events
        energy: List of energy events
        
    Returns:
        Dictionary with combined clusters
    """
    symptom_clusters = cluster_symptoms(symptoms)
    
    # Group sleep by quality ranges
    sleep_by_quality = defaultdict(list)
    for event in sleep:
        quality = event.get('quality', 0.5)
        if quality < 0.4:
            quality_range = "poor"
        elif quality < 0.7:
            quality_range = "moderate"
        else:
            quality_range = "good"
        sleep_by_quality[quality_range].append(event)
    
    # Group energy by level ranges
    energy_by_level = defaultdict(list)
    for event in energy:
        level = event.get('level', 0.5)
        if level < 0.3:
            level_range = "low"
        elif level < 0.7:
            level_range = "moderate"
        else:
            level_range = "high"
        energy_by_level[level_range].append(event)
    
    return {
        "symptom_clusters": symptom_clusters.get("clusters", []),
        "sleep_by_quality": dict(sleep_by_quality),
        "energy_by_level": dict(energy_by_level)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    symptoms = kwargs.get("symptoms", [])
    sleep = kwargs.get("sleep", [])
    energy = kwargs.get("energy", [])
    
    return cluster_health_events(symptoms, sleep, energy)

