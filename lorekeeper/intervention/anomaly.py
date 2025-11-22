"""
Anomaly Detection
"""

from typing import List, Dict, Any
import numpy as np
from sklearn.ensemble import IsolationForest


def detect_anomalies(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Detect anomalies using embeddings
    
    TODO: Implement Isolation Forest or autoencoder-based anomaly detection
    """
    interventions = []
    
    if len(events) < 10:
        return interventions
    
    # Extract embeddings
    embeddings = []
    valid_events = []
    
    for event in events:
        if 'embedding' in event and event['embedding']:
            embeddings.append(event['embedding'])
            valid_events.append(event)
    
    if len(embeddings) < 10:
        return interventions
    
    try:
        # Use Isolation Forest for anomaly detection
        X = np.array(embeddings)
        clf = IsolationForest(contamination=0.1, random_state=42)
        predictions = clf.fit_predict(X)
        
        # Find anomalies (predictions == -1)
        anomalies = [valid_events[i] for i, pred in enumerate(predictions) if pred == -1]
        
        if len(anomalies) > 0:
            # Check if anomalies are recent
            recent_anomalies = [a for a in anomalies if a == valid_events[-1] or a == valid_events[-2]]
            
            if recent_anomalies:
                interventions.append({
                    "type": "risk_event",
                    "severity": "high",
                    "confidence": 0.8,
                    "message": "Detected anomalous pattern in recent entries that may require attention.",
                })
    except Exception as e:
        # Silently fail if ML libraries not available
        pass
    
    return interventions

