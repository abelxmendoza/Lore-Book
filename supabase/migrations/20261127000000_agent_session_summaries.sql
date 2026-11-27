create table public.agent_session_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  agent text not null,
  source_ref text not null,
  summary text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key),
  check (char_length(agent) between 1 and 60),
  check (char_length(source_ref) between 1 and 500),
  check (char_length(summary) between 20 and 8000)
);
create index agent_session_summaries_user_created_idx
  on public.agent_session_summaries (user_id, created_at desc, idempotency_key);
alter table public.agent_session_summaries enable row level security;
revoke all on public.agent_session_summaries from public, anon, authenticated;
grant select, insert on public.agent_session_summaries to service_role;
