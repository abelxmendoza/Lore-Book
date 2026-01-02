"""
Financial Risk Modeling
Assesses financial risk based on spending patterns and income
"""

from typing import List, Dict, Any


def assess_risk(transactions: List[Dict[str, Any]], income: float) -> Dict[str, Any]:
    """
    Assess financial risk
    
    Args:
        transactions: List of transactions
        income: Average income
        
    Returns:
        Dictionary with risk assessment
    """
    expenses = [t for t in transactions if t.get('direction') == 'out']
    total_expenses = sum(t.get('amount', 0) for t in expenses)
    
    # Calculate expense-to-income ratio
    if income > 0:
        expense_ratio = total_expenses / income
    else:
        expense_ratio = 1.0
    
    # Risk factors
    risk_score = 0.0
    risk_factors = []
    
    if expense_ratio > 0.9:
        risk_score += 0.4
        risk_factors.append("high_expense_ratio")
    elif expense_ratio > 0.7:
        risk_score += 0.2
        risk_factors.append("moderate_expense_ratio")
    
    # Debt presence
    debt_transactions = [t for t in transactions if t.get('category') == 'debt']
    if debt_transactions:
        total_debt = sum(t.get('amount', 0) for t in debt_transactions)
        if income > 0 and total_debt > income * 0.5:
            risk_score += 0.3
            risk_factors.append("high_debt_burden")
        else:
            risk_score += 0.1
            risk_factors.append("debt_present")
    
    # Volatility in spending
    if len(expenses) > 1:
        amounts = [t.get('amount', 0) for t in expenses]
        avg = sum(amounts) / len(amounts)
        variance = sum((a - avg) ** 2 for a in amounts) / len(amounts)
        std_dev = variance ** 0.5
        coefficient_of_variation = std_dev / avg if avg > 0 else 0
        
        if coefficient_of_variation > 0.5:
            risk_score += 0.2
            risk_factors.append("volatile_spending")
    
    risk_score = min(1.0, risk_score)
    
    return {
        "risk_score": risk_score,
        "risk_factors": risk_factors,
        "expense_ratio": expense_ratio,
        "confidence": min(1.0, len(transactions) / 20)
    }


def handle(**kwargs) -> Dict[str, Any]:
    """Handle function for Python bridge"""
    transactions = kwargs.get("transactions", [])
    income = kwargs.get("income", 0)
    return assess_risk(transactions, income)

