import { useCallback, useEffect, useState } from 'react';

import { fetchJson } from '../lib/api';

export type RiskAlert = {
  alert_type: string;
  confidence: number;
  evidence: string[];
  risk_level: number;
};

export type DailyRecommendation = {
  description: string;
  confidence: number;
  evidence: string[];
  suggested_tasks: Array<{ title?: string; priority?: number; due_date?: string }>;
  urgency: string;
};

export type WeeklyStrategy = {
  description: string;
  confidence: number;
  evidence: string[];
  focus_areas: string[];
};

export type MonthlyCorrection = {
  description: string;
  confidence: number;
  evidence: string[];
  adjustments: string[];
};

export type TransitionGuidance = {
  description: string;
  evidence: string[];
  identity_shift_detected: boolean;
  recommended_behavior: string[];
};

export type MomentumSignal = {
  description: string;
  evidence: string[];
  skill_area: string;
  momentum_score: number;
};

export const useAutopilot = () => {
  const [dailyPlan, setDailyPlan] = useState<DailyRecommendation | null>(null);
  const [weeklyStrategy, setWeeklyStrategy] = useState<WeeklyStrategy | null>(null);
  const [monthlyCorrection, setMonthlyCorrection] = useState<MonthlyCorrection | null>(null);
  const [transition, setTransition] = useState<TransitionGuidance | null>(null);
  const [alerts, setAlerts] = useState<Record<string, RiskAlert>>({});
  const [momentum, setMomentum] = useState<MomentumSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [daily, weekly, monthly, transitionData, alertData, momentumData] = await Promise.all([
        fetchJson<{ daily_plan: DailyRecommendation }>('/api/autopilot/daily'),
        fetchJson<{ weekly_strategy: WeeklyStrategy }>('/api/autopilot/weekly'),
        fetchJson<{ monthly_correction: MonthlyCorrection }>('/api/autopilot/monthly'),
        fetchJson<{ arc_transition: TransitionGuidance }>('/api/autopilot/transition'),
        fetchJson<{ alerts: Record<string, RiskAlert> }>('/api/autopilot/alerts'),
        fetchJson<{ momentum: MomentumSignal }>('/api/autopilot/momentum')
      ]);

      setDailyPlan(daily.daily_plan);
      setWeeklyStrategy(weekly.weekly_strategy);
      setMonthlyCorrection(monthly.monthly_correction);
      setTransition(transitionData.arc_transition);
      setAlerts(alertData.alerts);
      setMomentum(momentumData.momentum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load autopilot data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { dailyPlan, weeklyStrategy, monthlyCorrection, transition, alerts, momentum, loading, error, refresh };
};
