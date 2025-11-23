"""
Financial Transaction Clustering
Clusters transactions by category and patterns
"""

from typing import List, Dict, Any
from collections import defaultdict


def cluster_transactions(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Cluster transactions by category
    
    Args:
        transactions: List of transaction events
        
    Returns:
        Dictionary with clusters
    """
    clusters = []
    
    # Group by category
    category_groups = defaultdict(list)
    for transaction in transactions:
        category = transaction.get('category', 'uncategorized')
        category_groups[category].append(transaction)
    
    # Create clusters from category groups
    cluster_id = 0
    for category, category_transactions in category_groups.items():
        if len(category_transactions) >= 2:
            total_amount = sum(t.get('amount', 0) for t in category_transactions)
            avg_amount = total_amount / len(category_transactions)
            
            clusters.append({
                "id": f"cluster_{cluster_id}",
                "category": category,
                "transactions": category_transactions,
                "count": len(category_transactions),
                "total_amount": total_amount,
                "average_amount": avg_amount
            })
            cluster_id += 1
    
    return {"clusters": clusters}


def handle(**kwargs) -> Dict[str, Any]:
    """
    Handle function for Python bridge
    """
    transactions = kwargs.get("transactions", [])
    return cluster_transactions(transactions)

