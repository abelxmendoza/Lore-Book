-- Subscription and usage tracking tables for Lore Keeper
-- Supports Stripe integration with free tier and premium subscriptions

-- Create enum types for subscription status and plan type
create type subscription_status as enum ('trial', 'active', 'canceled', 'past_due', 'incomplete', 'incomplete_expired');
create type plan_type as enum ('free', 'premium');

-- Subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status subscription_status not null default 'free',
  plan_type plan_type not null default 'free',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

comment on table public.subscriptions is 'User subscription information linked to Stripe';
comment on column public.subscriptions.stripe_customer_id is 'Stripe customer ID for billing';
comment on column public.subscriptions.stripe_subscription_id is 'Stripe subscription ID (null for free tier)';
comment on column public.subscriptions.status is 'Current subscription status';
comment on column public.subscriptions.plan_type is 'Subscription plan type';
comment on column public.subscriptions.trial_ends_at is 'When the trial period ends (if in trial)';
comment on column public.subscriptions.cancel_at_period_end is 'Whether subscription is set to cancel at period end';

-- Subscription usage tracking table
create table if not exists public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  month date not null, -- First day of the month (YYYY-MM-01)
  entry_count integer not null default 0,
  ai_requests_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, month)
);

comment on table public.subscription_usage is 'Monthly usage tracking for entries and AI requests';
comment on column public.subscription_usage.month is 'First day of the tracking month';
comment on column public.subscription_usage.entry_count is 'Number of entries created this month';
comment on column public.subscription_usage.ai_requests_count is 'Number of AI requests made this month';

-- Create indexes for performance
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_stripe_customer_id_idx on public.subscriptions(stripe_customer_id);
create index if not exists subscriptions_stripe_subscription_id_idx on public.subscriptions(stripe_subscription_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists subscriptions_trial_ends_at_idx on public.subscriptions(trial_ends_at) where trial_ends_at is not null;

create index if not exists subscription_usage_user_id_idx on public.subscription_usage(user_id);
create index if not exists subscription_usage_month_idx on public.subscription_usage(month);
create index if not exists subscription_usage_user_month_idx on public.subscription_usage(user_id, month);

-- Enable Row Level Security
alter table public.subscriptions enable row level security;
alter table public.subscription_usage enable row level security;

-- RLS Policies for subscriptions
create policy subscriptions_owner_select on public.subscriptions
  for select using (auth.uid() = user_id);
create policy subscriptions_owner_insert on public.subscriptions
  for insert with check (auth.uid() = user_id);
create policy subscriptions_owner_update on public.subscriptions
  for update using (auth.uid() = user_id);

-- RLS Policies for subscription_usage
create policy subscription_usage_owner_select on public.subscription_usage
  for select using (auth.uid() = user_id);
create policy subscription_usage_owner_insert on public.subscription_usage
  for insert with check (auth.uid() = user_id);
create policy subscription_usage_owner_update on public.subscription_usage
  for update using (auth.uid() = user_id);

-- Function to initialize free tier subscription for new users
create or replace function initialize_free_subscription()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, status, plan_type)
  values (new.id, 'active', 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create free subscription when user is created
drop trigger if exists on_user_created_create_subscription on auth.users;
create trigger on_user_created_create_subscription
  after insert on auth.users
  for each row
  execute function initialize_free_subscription();

-- Function to get or create current month usage record
create or replace function get_or_create_usage(p_user_id uuid, p_month date)
returns uuid as $$
declare
  usage_id uuid;
begin
  -- Get first day of month
  p_month := date_trunc('month', p_month)::date;
  
  -- Try to get existing record
  select id into usage_id
  from public.subscription_usage
  where user_id = p_user_id and month = p_month;
  
  -- Create if doesn't exist
  if usage_id is null then
    insert into public.subscription_usage (user_id, month, entry_count, ai_requests_count)
    values (p_user_id, p_month, 0, 0)
    returning id into usage_id;
  end if;
  
  return usage_id;
end;
$$ language plpgsql security definer;

