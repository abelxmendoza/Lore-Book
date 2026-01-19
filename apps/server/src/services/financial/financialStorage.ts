import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  FinancialTransaction,
  SpendingPattern,
  IncomeTrend,
  InvestmentProfile,
  FinancialScore,
  MoneyMindsetInsight,
  FinancialInsight,
  TransactionCategory,
  FinancialStats,
} from './types';

/**
 * Handles storage and retrieval of financial data
 */
export class FinancialStorage {
  /**
   * Save financial transactions
   */
  async saveTransactions(transactions: FinancialTransaction[]): Promise<FinancialTransaction[]> {
    if (transactions.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('financial_transactions')
        .insert(
          transactions.map(t => ({
            user_id: t.user_id,
            timestamp: t.timestamp,
            category: t.category,
            amount: t.amount,
            direction: t.direction,
            evidence: t.evidence,
            entry_id: t.entry_id,
            metadata: t.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save financial transactions');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved financial transactions');
      return (data || []) as FinancialTransaction[];
    } catch (error) {
      logger.error({ error }, 'Failed to save financial transactions');
      return [];
    }
  }

  /**
   * Save spending patterns
   */
  async saveSpendingPatterns(userId: string, patterns: SpendingPattern[]): Promise<SpendingPattern[]> {
    if (patterns.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('spending_patterns')
        .insert(
          patterns.map(p => ({
            user_id: userId,
            category: p.category,
            average: p.average,
            frequency: p.frequency,
            volatility: p.volatility,
            total: p.total,
            trend: p.trend,
            metadata: {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save spending patterns');
        return [];
      }

      return (data || []) as SpendingPattern[];
    } catch (error) {
      logger.error({ error }, 'Failed to save spending patterns');
      return [];
    }
  }

  /**
   * Save income trend
   */
  async saveIncomeTrend(userId: string, trend: IncomeTrend): Promise<IncomeTrend | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('income_trends')
        .insert({
          user_id: userId,
          average_income: trend.averageIncome,
          stability: trend.stability,
          growth_rate: trend.growthRate,
          frequency: trend.frequency,
          last_income: trend.lastIncome,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save income trend');
        return null;
      }

      return {
        averageIncome: data.average_income,
        stability: data.stability,
        growthRate: data.growth_rate,
        frequency: data.frequency,
        lastIncome: data.last_income,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save income trend');
      return null;
    }
  }

  /**
   * Save investment profile
   */
  async saveInvestmentProfile(userId: string, profile: InvestmentProfile): Promise<InvestmentProfile | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('investment_profiles')
        .insert({
          user_id: userId,
          risk_level: profile.riskLevel,
          consistency: profile.consistency,
          diversification: profile.diversification,
          dca_strength: profile.DCA_strength,
          total_invested: profile.totalInvested || 0,
          frequency: profile.frequency || 0,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save investment profile');
        return null;
      }

      return {
        riskLevel: data.risk_level,
        consistency: data.consistency,
        diversification: data.diversification,
        DCA_strength: data.dca_strength,
        totalInvested: data.total_invested,
        frequency: data.frequency,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save investment profile');
      return null;
    }
  }

  /**
   * Save financial score
   */
  async saveFinancialScore(userId: string, score: FinancialScore): Promise<FinancialScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('financial_scores')
        .insert({
          user_id: userId,
          spending: score.spending,
          income: score.income,
          investments: score.investments,
          savings: score.savings,
          overall: score.overall,
          metadata: {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save financial score');
        return null;
      }

      return {
        spending: data.spending,
        income: data.income,
        investments: data.investments,
        savings: data.savings,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to save financial score');
      return null;
    }
  }

  /**
   * Save money mindset insights
   */
  async saveMindsetInsights(insights: MoneyMindsetInsight[]): Promise<MoneyMindsetInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('money_mindset_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            evidence: i.evidence,
            confidence: i.confidence,
            timestamp: i.timestamp,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save money mindset insights');
        return [];
      }

      return (data || []) as MoneyMindsetInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save money mindset insights');
      return [];
    }
  }

  /**
   * Save financial insights
   */
  async saveInsights(insights: FinancialInsight[]): Promise<FinancialInsight[]> {
    if (insights.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('financial_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            timestamp: i.timestamp,
            confidence: i.confidence,
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save financial insights');
        return [];
      }

      return (data || []) as FinancialInsight[];
    } catch (error) {
      logger.error({ error }, 'Failed to save financial insights');
      return [];
    }
  }

  /**
   * Get financial transactions
   */
  async getTransactions(userId: string, category?: TransactionCategory, direction?: 'in' | 'out'): Promise<FinancialTransaction[]> {
    try {
      let query = supabaseAdmin
        .from('financial_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      if (direction) {
        query = query.eq('direction', direction);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get financial transactions');
        return [];
      }

      return (data || []) as FinancialTransaction[];
    } catch (error) {
      logger.error({ error }, 'Failed to get financial transactions');
      return [];
    }
  }

  /**
   * Get latest financial score
   */
  async getLatestFinancialScore(userId: string): Promise<FinancialScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('financial_scores')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        spending: data.spending,
        income: data.income,
        investments: data.investments,
        savings: data.savings,
        overall: data.overall,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get financial score');
      return null;
    }
  }

  /**
   * Get financial statistics
   */
  async getStats(userId: string): Promise<FinancialStats> {
    try {
      const { data: transactions, error: transactionError } = await supabaseAdmin
        .from('financial_transactions')
        .select('category, amount, direction')
        .eq('user_id', userId);

      const { data: score, error: scoreError } = await supabaseAdmin
        .from('financial_scores')
        .select('overall')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (transactionError || scoreError) {
        return this.getEmptyStats();
      }

      // Calculate totals
      const income = (transactions || []).filter(t => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0);
      const expenses = (transactions || []).filter(t => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0);
      const netFlow = income - expenses;

      // Calculate by category
      const byCategory: Record<string, number> = {};
      (transactions || []).forEach(t => {
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      });

      // Top spending categories
      const topSpending = Object.entries(byCategory)
        .map(([category, count]) => ({ category: category as TransactionCategory, amount: count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return {
        total_transactions: transactions?.length || 0,
        total_income: income,
        total_expenses: expenses,
        net_flow: netFlow,
        transactions_by_category: byCategory as Record<TransactionCategory, number>,
        top_spending_categories: topSpending,
        financial_score: score?.overall || 0,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get financial stats');
      return this.getEmptyStats();
    }
  }

  /**
   * Get empty stats
   */
  private getEmptyStats(): FinancialStats {
    return {
      total_transactions: 0,
      total_income: 0,
      total_expenses: 0,
      net_flow: 0,
      transactions_by_category: {} as Record<TransactionCategory, number>,
      top_spending_categories: [],
      financial_score: 0,
    };
  }
}

