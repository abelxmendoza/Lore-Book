-- Test data for Finance Dashboard
-- Run this AFTER running 20250130_finance_tables.sql

-- Insert some test payment events
-- Note: Replace 'USER_ID_HERE' with an actual user ID from your auth.users table

-- Get a real user ID first
DO $$
DECLARE
  test_user_id uuid;
BEGIN
  -- Get first user from auth.users
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Insert test payment events
    INSERT INTO public.payment_events (user_id, stripe_customer_id, event_type, amount, currency, status, created_at)
    VALUES
      (test_user_id, 'cus_test123', 'payment_succeeded', 15.00, 'usd', 'succeeded', NOW() - INTERVAL '5 days'),
      (test_user_id, 'cus_test123', 'payment_succeeded', 15.00, 'usd', 'succeeded', NOW() - INTERVAL '35 days'),
      (test_user_id, 'cus_test123', 'payment_succeeded', 15.00, 'usd', 'succeeded', NOW() - INTERVAL '65 days'),
      (test_user_id, 'cus_test456', 'payment_succeeded', 15.00, 'usd', 'succeeded', NOW() - INTERVAL '10 days'),
      (test_user_id, 'cus_test456', 'payment_failed', 15.00, 'usd', 'failed', NOW() - INTERVAL '2 days'),
      (test_user_id, 'cus_test789', 'refund', 15.00, 'usd', 'refunded', NOW() - INTERVAL '1 day')
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Inserted test payment events for user: %', test_user_id;
  ELSE
    RAISE NOTICE 'No users found. Please create a user first.';
  END IF;
END $$;

-- Insert test monthly financials data
INSERT INTO public.monthly_financials (month, mrr, revenue, active_subscriptions, new_subscriptions, churned_subscriptions, churn_rate, refunds)
VALUES
  ('2025-07-01', 30.00, 30.00, 2, 2, 0, 0.00, 0.00),
  ('2025-08-01', 45.00, 45.00, 3, 1, 0, 0.00, 0.00),
  ('2025-09-01', 30.00, 30.00, 2, 0, 1, 33.33, 15.00),
  ('2025-10-01', 30.00, 15.00, 2, 0, 0, 0.00, 0.00)
ON CONFLICT (month) DO UPDATE SET
  mrr = EXCLUDED.mrr,
  revenue = EXCLUDED.revenue,
  active_subscriptions = EXCLUDED.active_subscriptions,
  new_subscriptions = EXCLUDED.new_subscriptions,
  churned_subscriptions = EXCLUDED.churned_subscriptions,
  churn_rate = EXCLUDED.churn_rate,
  refunds = EXCLUDED.refunds;

-- Update subscriptions table with test data (if subscriptions table exists)
DO $$
DECLARE
  test_user_id uuid;
BEGIN
  SELECT id INTO test_user_id FROM auth.users LIMIT 1;
  
  IF test_user_id IS NOT NULL THEN
    -- Update or insert test subscription
    INSERT INTO public.subscriptions (user_id, status, plan_type, current_period_end, stripe_customer_id)
    VALUES (test_user_id, 'active', 'premium', NOW() + INTERVAL '20 days', 'cus_test123')
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'active',
      plan_type = 'premium',
      current_period_end = NOW() + INTERVAL '20 days';
    
    RAISE NOTICE 'Updated test subscription for user: %', test_user_id;
  END IF;
END $$;

