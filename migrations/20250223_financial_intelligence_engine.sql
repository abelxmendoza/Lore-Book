-- Financial Intelligence Engine Schema
-- Stores transactions, spending patterns, income trends, investments, and financial insights

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Financial Transactions Table
-- Stores extracted financial transactions from journal entries
CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'food', 'transport', 'rent', 'entertainment', 'shopping', 'subscriptions',
    'debt', 'investment', 'income', 'healthcare', 'education', 'utilities', 'uncategorized'
  )),
  amount FLOAT NOT NULL CHECK (amount > 0),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  evidence TEXT NOT NULL,
  entry_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spending Patterns Table
-- Stores spending pattern analysis
CREATE TABLE IF NOT EXISTS public.spending_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL,
  average FLOAT NOT NULL,
  frequency INT NOT NULL,
  volatility FLOAT NOT NULL,
  total FLOAT NOT NULL,
  trend TEXT CHECK (trend IN ('increasing', 'decreasing', 'stable')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Income Trends Table
-- Stores income trend analysis
CREATE TABLE IF NOT EXISTS public.income_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  average_income FLOAT NOT NULL,
  stability FLOAT NOT NULL CHECK (stability >= 0 AND stability <= 1),
  growth_rate FLOAT NOT NULL CHECK (growth_rate >= -1 AND growth_rate <= 1),
  frequency INT NOT NULL,
  last_income TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Investment Profiles Table
-- Stores investment behavior profiles
CREATE TABLE IF NOT EXISTS public.investment_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  risk_level FLOAT NOT NULL CHECK (risk_level >= 0 AND risk_level <= 1),
  consistency FLOAT NOT NULL CHECK (consistency >= 0 AND consistency <= 1),
  diversification FLOAT NOT NULL CHECK (diversification >= 0 AND diversification <= 1),
  dca_strength FLOAT NOT NULL CHECK (dca_strength >= 0 AND dca_strength <= 1),
  total_invested FLOAT DEFAULT 0,
  frequency INT DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial Scores Table
-- Stores financial health scores
CREATE TABLE IF NOT EXISTS public.financial_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  spending FLOAT NOT NULL CHECK (spending >= 0 AND spending <= 1),
  income FLOAT NOT NULL CHECK (income >= 0 AND income <= 1),
  investments FLOAT NOT NULL CHECK (investments >= 0 AND investments <= 1),
  savings FLOAT NOT NULL CHECK (savings >= 0 AND savings <= 1),
  overall FLOAT NOT NULL CHECK (overall >= 0 AND overall <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Money Mindset Insights Table
-- Stores money mindset patterns
CREATE TABLE IF NOT EXISTS public.money_mindset_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'scarcity', 'growth', 'avoidance', 'impulsive_spending', 'fear_of_loss',
    'delayed_gratification', 'wealth_building', 'anxiety', 'confidence'
  )),
  evidence TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Financial Insights Table
-- Stores financial insights
CREATE TABLE IF NOT EXISTS public.financial_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'high_spending', 'income_instability', 'investment_opportunity', 'financial_stress',
    'spending_pattern', 'savings_trend', 'debt_concern', 'wealth_building'
  )),
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Optimized for Performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_category ON public.financial_transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_timestamp ON public.financial_transactions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_direction ON public.financial_transactions(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_spending_patterns_user_timestamp ON public.spending_patterns(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_income_trends_user_timestamp ON public.income_trends(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_investment_profiles_user_timestamp ON public.investment_profiles(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_financial_scores_user_timestamp ON public.financial_scores(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_money_mindset_user_type ON public.money_mindset_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_money_mindset_timestamp ON public.money_mindset_insights(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_financial_insights_user_type ON public.financial_insights(user_id, type);
CREATE INDEX IF NOT EXISTS idx_financial_insights_timestamp ON public.financial_insights(user_id, timestamp DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spending_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_mindset_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_insights ENABLE ROW LEVEL SECURITY;

-- Users can only see their own financial transactions
CREATE POLICY "Users can view own financial transactions"
  ON public.financial_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own financial transactions (via service)
CREATE POLICY "Users can insert own financial transactions"
  ON public.financial_transactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own financial transactions
CREATE POLICY "Users can update own financial transactions"
  ON public.financial_transactions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own financial transactions
CREATE POLICY "Users can delete own financial transactions"
  ON public.financial_transactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own spending patterns
CREATE POLICY "Users can view own spending patterns"
  ON public.spending_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own spending patterns (via service)
CREATE POLICY "Users can insert own spending patterns"
  ON public.spending_patterns
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own spending patterns
CREATE POLICY "Users can update own spending patterns"
  ON public.spending_patterns
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own spending patterns
CREATE POLICY "Users can delete own spending patterns"
  ON public.spending_patterns
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own income trends
CREATE POLICY "Users can view own income trends"
  ON public.income_trends
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own income trends (via service)
CREATE POLICY "Users can insert own income trends"
  ON public.income_trends
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own income trends
CREATE POLICY "Users can update own income trends"
  ON public.income_trends
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own income trends
CREATE POLICY "Users can delete own income trends"
  ON public.income_trends
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own investment profiles
CREATE POLICY "Users can view own investment profiles"
  ON public.investment_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own investment profiles (via service)
CREATE POLICY "Users can insert own investment profiles"
  ON public.investment_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own investment profiles
CREATE POLICY "Users can update own investment profiles"
  ON public.investment_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own investment profiles
CREATE POLICY "Users can delete own investment profiles"
  ON public.investment_profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own financial scores
CREATE POLICY "Users can view own financial scores"
  ON public.financial_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own financial scores (via service)
CREATE POLICY "Users can insert own financial scores"
  ON public.financial_scores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own financial scores
CREATE POLICY "Users can update own financial scores"
  ON public.financial_scores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own financial scores
CREATE POLICY "Users can delete own financial scores"
  ON public.financial_scores
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own money mindset insights
CREATE POLICY "Users can view own money mindset insights"
  ON public.money_mindset_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own money mindset insights (via service)
CREATE POLICY "Users can insert own money mindset insights"
  ON public.money_mindset_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own money mindset insights
CREATE POLICY "Users can update own money mindset insights"
  ON public.money_mindset_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own money mindset insights
CREATE POLICY "Users can delete own money mindset insights"
  ON public.money_mindset_insights
  FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only see their own financial insights
CREATE POLICY "Users can view own financial insights"
  ON public.financial_insights
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own financial insights (via service)
CREATE POLICY "Users can insert own financial insights"
  ON public.financial_insights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own financial insights
CREATE POLICY "Users can update own financial insights"
  ON public.financial_insights
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own financial insights
CREATE POLICY "Users can delete own financial insights"
  ON public.financial_insights
  FOR DELETE
  USING (auth.uid() = user_id);

