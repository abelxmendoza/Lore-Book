"""
Habit Decay Prediction
"""

from typing import List, Dict, Any
from datetime import datetime, timedelta


def predict_decay(habits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Predict habit decay risk
    
    TODO: Implement ML-based decay prediction
    """
    decay_predictions = []
    
    for habit in habits:
        # Basic decay prediction based on last_performed
        last_performed = habit.get('last_performed')
        if not last_performed:
            decay_risk = 1.0
        else:
            # Calculate days since last performance
            try:
                last_date = datetime.fromisoformat(last_performed.replace('Z', '+00:00'))
                days_since = (datetime.now(last_date.tzinfo) - last_date).days
                
                # Higher days since = higher decay risk
                decay_risk = min(1.0, days_since / 14)  # 14 days = 100% risk
            except:
                decay_risk = 0.5
        
        if decay_risk >= 0.3:
            decay_predictions.append({
                "id": f"decay_{habit['id']}",
                "type": "decay_warning",
                "message": f"Habit '{habit['action']}' decay risk: {(decay_risk * 100):.0f}%",
                "confidence": 0.8,
                "timestamp": datetime.now().isoformat(),
                "habitId": habit['id'],
                "habit_id": habit['id'],
                "decay_risk": decay_risk,
            })
    
    return decay_predictions


