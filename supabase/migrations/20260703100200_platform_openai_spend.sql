-- Platform-wide OpenAI spend tracker (service-role writes from apps/server).
create table if not exists public.platform_openai_spend (
  month date primary key,
  estimated_usd numeric(12, 6) not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  call_count integer not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.platform_openai_spend is
  'Monthly estimated OpenAI spend for platform budget guard (MONTHLY_OPENAI_BUDGET_USD)';

alter table public.platform_openai_spend enable row level security;
