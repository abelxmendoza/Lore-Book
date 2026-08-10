-- Finance tracking tables for Omega Admin Console
-- Payment events and monthly financial metrics

-- Payment Events table
-- Tracks all Stripe payment events for admin analytics
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  event_type text not null, -- payment_succeeded, payment_failed, refund, invoice_paid, etc.
  amount decimal(10, 2) not null, -- in cents (stored as decimal for precision)
  currency text not null default 'usd',
  status text not null, -- succeeded, failed, pending, refunded
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

comment on table public.payment_events is 'Stripe payment events for admin finance dashboard';
comment on column public.payment_events.event_type is 'Type of payment event from Stripe';
comment on column public.payment_events.amount is 'Payment amount in cents';
comment on column public.payment_events.status is 'Payment status: succeeded, failed, pending, refunded';

-- Monthly Financials table
-- Precomputed monthly metrics for fast graph queries
create table if not exists public.monthly_financials (
  id uuid primary key default gen_random_uuid(),
  month date not null, -- First day of month (YYYY-MM-01)
  mrr decimal(10, 2) not null default 0, -- Monthly Recurring Revenue
  revenue decimal(10, 2) not null default 0, -- Total revenue for the month
  active_subscriptions integer not null default 0,
  new_subscriptions integer not null default 0,
  churned_subscriptions integer not null default 0,
  churn_rate decimal(5, 2) not null default 0, -- percentage
  refunds decimal(10, 2) not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(month)
);

comment on table public.monthly_financials is 'Precomputed monthly financial metrics for admin dashboard';
comment on column public.monthly_financials.month is 'First day of the month (YYYY-MM-01)';
comment on column public.monthly_financials.mrr is 'Monthly Recurring Revenue in cents';
comment on column public.monthly_financials.revenue is 'Total revenue for the month in cents';
comment on column public.monthly_financials.churn_rate is 'Churn rate as percentage (0-100)';

-- Create indexes for payment_events
create index if not exists payment_events_user_id_idx on public.payment_events(user_id);
create index if not exists payment_events_event_type_idx on public.payment_events(event_type);
create index if not exists payment_events_created_at_idx on public.payment_events(created_at desc);
create index if not exists payment_events_stripe_invoice_id_idx on public.payment_events(stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists payment_events_status_idx on public.payment_events(status);

-- Create indexes for monthly_financials
create index if not exists monthly_financials_month_idx on public.monthly_financials(month desc);

-- Enable Row Level Security
alter table public.payment_events enable row level security;
alter table public.monthly_financials enable row level security;

-- RLS Policies for payment_events
-- Admin-only access (no user policies - this is admin data)
-- Drop existing policy if it exists (idempotent migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'payment_events'
      AND p.policyname = 'payment_events_admin_select'
  ) THEN
    DROP POLICY payment_events_admin_select ON public.payment_events;
  END IF;
END $$;

create policy payment_events_admin_select on public.payment_events
  for select using (false); -- Disable default access, will use service role in admin routes

-- RLS Policies for monthly_financials
-- Admin-only access
-- Drop existing policy if it exists (idempotent migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'monthly_financials'
      AND p.policyname = 'monthly_financials_admin_select'
  ) THEN
    DROP POLICY monthly_financials_admin_select ON public.monthly_financials;
  END IF;
END $$;

create policy monthly_financials_admin_select on public.monthly_financials
  for select using (false); -- Disable default access, will use service role in admin routes

-- Function to update updated_at timestamp
create or replace function update_monthly_financials_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to update updated_at on monthly_financials
drop trigger if exists update_monthly_financials_timestamp on public.monthly_financials;
create trigger update_monthly_financials_timestamp
  before update on public.monthly_financials
  for each row
  execute function update_monthly_financials_updated_at();

