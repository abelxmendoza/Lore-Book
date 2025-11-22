"""
Goal Success Prediction
"""

from typing import List, Dict, Any
from datetime import datetime


def predict(goals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Predict success probability for goals
    
    Args:
        goals: List of goals with id, title, description, status, milestones, dependencies
        
    Returns:
        Dictionary with predictions list
    """
    predictions = []
    
    for goal in goals:
        # Calculate basic probability based on goal state
        probability = calculate_probability(goal)
        
        predictions.append({
            "id": f"pred_{goal['id']}",
            "type": "success_probability",
            "message": f"Predicted success probability for '{goal['title']}' is {(probability * 100):.0f}%.",
            "confidence": 0.7,
            "timestamp": datetime.now().isoformat(),
            "relatedGoalId": goal['id'],
            "related_goal_id": goal['id'],
            "probability": probability,
        })
    
    return {"predictions": predictions}


def calculate_probability(goal: Dict[str, Any]) -> float:
    """
    Calculate success probability for a goal
    """
    probability = 0.5  # Default
    
    # Adjust based on status
    status = goal.get('status', 'active')
    if status == 'completed':
        probability = 1.0
    elif status == 'abandoned':
        probability = 0.1
    elif status == 'paused':
        probability = 0.3
    elif status == 'active':
        probability = 0.6
    
    # Adjust based on milestones
    milestones = goal.get('milestones', [])
    if milestones:
        achieved = sum(1 for m in milestones if m.get('achieved', False))
        progress = achieved / len(milestones) if milestones else 0
        probability = min(0.9, probability + progress * 0.2)
    
    # Adjust based on dependencies
    dependencies = goal.get('dependencies', [])
    if dependencies:
        # Dependencies might reduce probability slightly
        probability = max(0.3, probability - 0.1)
    
    return probability


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    goals = kwargs.get("goals", [])
    return predict(goals)

