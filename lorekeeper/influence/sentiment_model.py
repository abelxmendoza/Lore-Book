"""
Sentiment Model for Influence Analysis
"""

from typing import List, Dict, Any


def analyze_sentiment(text: str) -> float:
    """
    Analyze sentiment of text
    Returns value between -1 (negative) and +1 (positive)
    
    TODO: Replace with actual ML model (e.g., VADER, TextBlob, or custom model)
    """
    text_lower = text.lower()
    
    # Simple keyword-based sentiment (placeholder)
    positive_words = [
        'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love',
        'enjoyed', 'fun', 'good', 'better', 'best', 'proud', 'grateful',
        'thankful', 'blessed', 'lucky', 'pleased', 'satisfied', 'content'
    ]
    
    negative_words = [
        'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried',
        'anxious', 'stressed', 'tired', 'exhausted', 'bad', 'worse', 'worst',
        'hate', 'regret', 'guilty', 'ashamed', 'embarrassed', 'hurt', 'pain'
    ]
    
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    
    if positive_count == 0 and negative_count == 0:
        return 0.0
    
    total = positive_count + negative_count
    sentiment = (positive_count - negative_count) / total
    
    return max(-1.0, min(1.0, sentiment))


def analyze_sentiment_batch(texts: List[str]) -> List[float]:
    """
    Analyze sentiment for multiple texts
    """
    return [analyze_sentiment(text) for text in texts]


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    text = kwargs.get("text", "")
    texts = kwargs.get("texts", [])
    
    if texts:
        sentiments = analyze_sentiment_batch(texts)
        return {"sentiments": sentiments}
    else:
        sentiment = analyze_sentiment(text)
        return {"sentiment": sentiment}

