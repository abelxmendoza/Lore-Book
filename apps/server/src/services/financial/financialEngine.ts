import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  FinancialOutput,
  FinancialContext,
  FinancialInsight,
  TransactionCategory,
} from './types';
import { TransactionExtractor } from './transactionExtractor';
import { SpendingClassifier } from './spendingClassifier';
import { IncomeDetector } from './incomeDetector';
import { InvestmentBehavior } from './investmentBehavior';
import { FinancialStressModel } from './financialStress';
import { MoneyMindsetDetector } from './patternDetector';
import { FinancialForecaster } from './forecasting';
import { FinancialScoreService } from './financialScore';

/**
 * Main Financial Intelligence Engine
 * Tracks spending patterns, income trends, investment behavior, and financial health
 */
export class FinancialEngine {
  private extractor: TransactionExtractor;
  private spendingClassifier: SpendingClassifier;
  private incomeDetector: IncomeDetector;
  private investmentBehavior: InvestmentBehavior;
  private stressModel: FinancialStressModel;
  private mindsetDetector: MoneyMindsetDetector;
  private forecaster: FinancialForecaster;
  private scoreService: FinancialScoreService;

  constructor() {
    this.extractor = new TransactionExtractor();
    this.spendingClassifier = new SpendingClassifier();
    this.incomeDetector = new IncomeDetector();
    this.investmentBehavior = new InvestmentBehavior();
    this.stressModel = new FinancialStressModel();
    this.mindsetDetector = new MoneyMindsetDetector();
    this.forecaster = new FinancialForecaster();
    this.scoreService = new FinancialScoreService();
  }

  /**
   * Process financial intelligence for a user
   */
  async process(userId: string): Promise<FinancialOutput> {
    try {
      logger.debug({ userId }, 'Processing financial intelligence');

      // Build context
      const context = await this.buildContext(userId);

      // Extract transactions
      const transactions = this.extractor.extract(context.entries || []);
      transactions.forEach(t => { t.user_id = userId; });

      // Classify spending
      const spending = this.spendingClassifier.classify(transactions);

      // Detect income trends
      const income = this.incomeDetector.detect(transactions);

      // Profile investment behavior
      const investments = this.investmentBehavior.profile(transactions);

      // Compute financial stress
      const financialStress = this.stressModel.compute(transactions, income);

      // Detect money mindset
      const mindset = this.mindsetDetector.detect(context.entries || []);
      mindset.forEach(m => { m.user_id = userId; });

      // Forecast future
      const forecast = this.forecaster.forecast(transactions, income, spending);

      // Compute financial score
      const score = this.scoreService.compute(spending, income, investments, forecast);

      // Generate insights
      const insights: FinancialInsight[] = [];

      // High spending insights
      const highSpendingCategories = spending.filter(p => p.average > 500);
      if (highSpendingCategories.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'high_spending',
          message: `High spending detected in: ${highSpendingCategories.map(p => p.category).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.8,
          user_id: userId,
          metadata: {
            categories: highSpendingCategories.map(p => ({ category: p.category, average: p.average })),
          },
        });
      }

      // Income instability insights
      if (income.stability < 0.5) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'income_instability',
          message: `Income instability detected (stability: ${(income.stability * 100).toFixed(0)}%).`,
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            stability: income.stability,
            average_income: income.averageIncome,
          },
        });
      }

      // Investment opportunity insights
      if (investments.frequency === 0 && income.averageIncome > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'investment_opportunity',
          message: 'No investments detected. Consider starting an investment strategy.',
          timestamp: new Date().toISOString(),
          confidence: 0.9,
          user_id: userId,
          metadata: {
            average_income: income.averageIncome,
          },
        });
      }

      // Financial stress insights
      if (financialStress.score > 0.6) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'financial_stress',
          message: `High financial stress detected (${(financialStress.score * 100).toFixed(0)}%). Drivers: ${financialStress.drivers.join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: financialStress.confidence,
          user_id: userId,
          metadata: {
            stress_score: financialStress.score,
            drivers: financialStress.drivers,
          },
        });
      }

      // Spending pattern insights
      const increasingSpending = spending.filter(p => p.trend === 'increasing');
      if (increasingSpending.length > 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'spending_pattern',
          message: `Increasing spending trend detected in: ${increasingSpending.map(p => p.category).join(', ')}`,
          timestamp: new Date().toISOString(),
          confidence: 0.75,
          user_id: userId,
          metadata: {
            categories: increasingSpending.map(p => ({ category: p.category, trend: p.trend })),
          },
        });
      }

      // Savings trend insights
      const avgSavings = forecast.savingsProjection.reduce((sum, s) => sum + s, 0) / forecast.savingsProjection.length;
      if (avgSavings < 0) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'savings_trend',
          message: 'Negative savings projected. Expenses exceed income.',
          timestamp: new Date().toISOString(),
          confidence: forecast.confidence,
          user_id: userId,
          metadata: {
            average_savings: avgSavings,
          },
        });
      }

      // Debt concern insights
      const debtTransactions = transactions.filter(t => t.category === 'debt');
      if (debtTransactions.length > 0) {
        const totalDebt = debtTransactions.reduce((sum, t) => sum + t.amount, 0);
        if (totalDebt > income.averageIncome * 0.5) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'debt_concern',
            message: `High debt burden detected (${totalDebt.toFixed(2)} vs income ${income.averageIncome.toFixed(2)}).`,
            timestamp: new Date().toISOString(),
            confidence: 0.9,
            user_id: userId,
            metadata: {
              total_debt: totalDebt,
              average_income: income.averageIncome,
              ratio: totalDebt / income.averageIncome,
            },
          });
        }
      }

      // Wealth building insights
      const wealthBuildingMindset = mindset.filter(m => m.type === 'wealth_building');
      if (wealthBuildingMindset.length > 0 && investments.consistency > 0.5) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'wealth_building',
          message: 'Strong wealth-building mindset detected with consistent investment behavior.',
          timestamp: new Date().toISOString(),
          confidence: 0.85,
          user_id: userId,
          metadata: {
            investment_consistency: investments.consistency,
            mindset_count: wealthBuildingMindset.length,
          },
        });
      }

      // Add user_id to all insights
      insights.forEach(i => { i.user_id = userId; });

      logger.info(
        {
          userId,
          transactions: transactions.length,
          spending: spending.length,
          investments: investments.frequency,
          financialScore: score.overall,
          insights: insights.length,
        },
        'Processed financial intelligence'
      );

      return {
        transactions,
        spending,
        income,
        investments,
        financialStress,
        mindset,
        forecast,
        score,
        insights,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to process financial intelligence');
      return {
        transactions: [],
        spending: [],
        income: {
          averageIncome: 0,
          stability: 0,
          growthRate: 0,
          frequency: 0,
        },
        investments: {
          riskLevel: 0.5,
          consistency: 0.3,
          diversification: 0.3,
          DCA_strength: 0.3,
        },
        financialStress: {
          score: 0.5,
          drivers: [],
          confidence: 0,
        },
        mindset: [],
        forecast: {
          savingsProjection: [],
          spendingProjection: [],
          investmentProjection: [],
          incomeProjection: [],
          confidence: 0,
          months: 12,
        },
        score: {
          spending: 0.5,
          income: 0.5,
          investments: 0.5,
          savings: 0.5,
          overall: 0.5,
        },
        insights: [],
      };
    }
  }

  /**
   * Build financial context from entries
   */
  private async buildContext(userId: string): Promise<FinancialContext> {
    const context: FinancialContext = {};

    try {
      // Get recent entries
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1000); // More entries for financial analysis

      context.entries = entries || [];

      // Get chronology data if available
      // TODO: Fetch from chronology engine if needed

      // Get identity pulse data if available
      // TODO: Fetch from identity pulse service if needed

    } catch (error) {
      logger.error({ error }, 'Failed to build financial context');
    }

    return context;
  }
}

