"""
Financial Seasonality Detection
Detects seasonal patterns in spending and income
"""

from typing import List, Dict, Any
from collections import defaultdict


def detect_seasonality(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect seasonal patterns in financial transactions
    
    Args:
        transactions: List of transactions with timestamp
        
    Returns:
        Dictionary with seasonal patterns
    """
    # Group by month
    by_month = defaultdict(lambda: {"income": 0, "expenses": 0, "count": 0})
    
    for transaction in transactions:
        timestamp = transaction.get('timestamp', '')
        direction = transaction.get('direction', 'out')
        amount = transaction.get('amount', 0)
        
        if timestamp:
            try:
                month = int(timestamp.split('-')[1]) if '-' in timestamp else 1
                by_month[month]["count"] += 1
                if direction == 'in':
                    by_month[month]["income"] += amount
                else:
                    by_month[month]["expenses"] += amount
            except:
                pass
    
    # Find peak months
    if by_month:
        max_expenses = max(m["expenses"] for m in by_month.values())
        peak_expense_months = [m for m, data in by_month.items() if data["expenses"] == max_expenses]
        
        max_income = max(m["income"] for m in by_month.values())
        peak_income_months = [m for m, data in by_month.items() if data["income"] == max_income]
    else:
        peak_expense_months = []
        peak_income_months = []
    
    return {
        "by_month": dict(by_month),
        "peak_expense_months": peak_expense_months,
        "peak_income_months": peak_income_months
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    transactions = kwargs.get("transactions", [])
    return detect_seasonality(transactions)

