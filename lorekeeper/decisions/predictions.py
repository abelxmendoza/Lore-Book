"""
Decision Consequence Prediction
"""

from typing import List, Dict, Any
from datetime import datetime


def predict(decisions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Predict consequences for decisions
    
    Args:
        decisions: List of decisions with id, description, category, outcome, risk_level
        
    Returns:
        Dictionary with consequences list
    """
    consequences = []
    
    for decision in decisions:
        description = decision.get('description', '')
        category = decision.get('category', 'other')
        outcome = decision.get('outcome')
        risk_level = decision.get('risk_level', 0.5)
        
        # Predict based on category, risk level, and historical outcome
        predicted = predict_consequence(description, category, outcome, risk_level)
        
        if predicted:
            # Calculate confidence based on available data
            confidence = 0.5
            if outcome:
                confidence += 0.2  # Historical outcome increases confidence
            if risk_level >= 0.7 or risk_level <= 0.3:
                confidence += 0.1  # Clear risk level increases confidence
            if category in ['financial', 'career', 'relationship']:
                confidence += 0.1  # High-impact categories have more predictable patterns
            
            consequences.append({
                "id": f"cons_{decision.get('id')}",
                "type": "consequence_prediction",
                "message": f'Predicted outcomes for "{description[:50]}...": {predicted}',
                "confidence": min(0.9, confidence),
                "timestamp": datetime.now().isoformat(),
                "decisionId": decision.get('id'),
                "decision_id": decision.get('id'),
                "predicted_consequence": predicted,
                "prediction_score": confidence,
            })
    
    return {"consequences": consequences}


def predict_consequence(description: str, category: str, outcome: str = None, risk_level: float = 0.5) -> str:
    """
    Predict consequence based on decision characteristics
    """
    desc_lower = description.lower()
    
    # If we have historical outcome, use it as primary indicator
    if outcome == 'positive':
        return 'Likely positive outcomes based on similar past decisions'
    if outcome == 'negative':
        return 'Potential negative consequences based on similar past decisions'
    
    # Category-based predictions
    category_predictions = {
        'career': 'May impact professional growth and opportunities',
        'financial': 'Could affect financial stability and resources',
        'relationship': 'May influence relationship dynamics and connections',
        'health': 'Could impact physical or mental well-being',
        'education': 'May affect learning and skill development',
        'location': 'Could change daily routine and environment',
        'family': 'May influence family relationships and dynamics',
        'social': 'Could affect social connections and activities',
    }
    
    base_prediction = category_predictions.get(category, 'Mixed outcomes possible')
    
    # Adjust based on risk level
    if risk_level >= 0.7:
        return f'High risk: {base_prediction}. Potential negative consequences.'
    if risk_level <= 0.3:
        return f'Low risk: {base_prediction}. Likely positive outcomes.'
    
    return base_prediction


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    decisions = kwargs.get("decisions", [])
    return predict(decisions)

