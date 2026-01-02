/**
 * Financial Intelligence Engine Type Definitions
 */

export type TransactionCategory =
  | 'food'
  | 'transport'
  | 'rent'
  | 'entertainment'
  | 'shopping'
  | 'subscriptions'
  | 'debt'
  | 'investment'
  | 'income'
  | 'healthcare'
  | 'education'
  | 'utilities'
  | 'uncategorized';

export type MoneyMindsetType =
  | 'scarcity'
  | 'growth'
  | 'avoidance'
  | 'impulsive_spending'
  | 'fear_of_loss'
  | 'delayed_gratification'
  | 'wealth_building'
  | 'anxiety'
  | 'confidence';

export interface FinancialTransaction {
  id?: string;
  user_id?: string;
  timestamp: string;
  category: TransactionCategory;
  amount: number;
  direction: 'in' | 'out'; // income / expense
  evidence: string;
  entry_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface SpendingPattern {
  category: string;
  average: number;
  frequency: number;
  volatility: number;
  total: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
}

export interface IncomeTrend {
  averageIncome: number;
  stability: number; // 0-1
  growthRate: number; // -1 to 1
  frequency: number;
  lastIncome?: string;
}

export interface InvestmentProfile {
  riskLevel: number; // 0-1
  consistency: number; // 0-1
  diversification: number; // 0-1
  DCA_strength: number; // Dollar Cost Averaging strength 0-1
  totalInvested?: number;
  frequency?: number;
}

export interface FinancialStressScore {
  score: number; // 0-1 (higher = more stress)
  drivers: string[];
  confidence: number; // 0-1
}

export interface MoneyMindsetInsight {
  id?: string;
  user_id?: string;
  type: MoneyMindsetType;
  evidence: string;
  confidence: number; // 0-1
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ForecastResult {
  savingsProjection: number[];
  spendingProjection: number[];
  investmentProjection: number[];
  incomeProjection: number[];
  confidence: number; // 0-1
  months: number;
}

export interface FinancialScore {
  spending: number; // 0-1 (higher = better)
  income: number; // 0-1
  investments: number; // 0-1
  savings: number; // 0-1
  overall: number; // 0-1
}

export interface FinancialOutput {
  transactions: FinancialTransaction[];
  spending: SpendingPattern[];
  income: IncomeTrend;
  investments: InvestmentProfile;
  financialStress: FinancialStressScore;
  mindset: MoneyMindsetInsight[];
  forecast: ForecastResult;
  score: FinancialScore;
  insights?: FinancialInsight[];
}

export interface FinancialInsight {
  id?: string;
  user_id?: string;
  type:
    | 'high_spending'
    | 'income_instability'
    | 'investment_opportunity'
    | 'financial_stress'
    | 'spending_pattern'
    | 'savings_trend'
    | 'debt_concern'
    | 'wealth_building';
  message: string;
  timestamp: string;
  confidence: number; // 0-1
  metadata?: Record<string, any>;
}

export interface FinancialContext {
  entries?: any[];
  chronology?: any;
  identity_pulse?: any;
}

export interface FinancialStats {
  total_transactions: number;
  total_income: number;
  total_expenses: number;
  net_flow: number;
  transactions_by_category: Record<TransactionCategory, number>;
  top_spending_categories: Array<{ category: TransactionCategory; amount: number }>;
  financial_score: number;
}

