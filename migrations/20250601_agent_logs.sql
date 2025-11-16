-- Agent logs for Omega Agent Network
create table if not exists public.agent_logs (
  id serial primary key,
  agent_name text not null,
  status text not null,
  output jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone default now()
);

create index if not exists agent_logs_agent_name_idx on public.agent_logs(agent_name);
create index if not exists agent_logs_created_at_idx on public.agent_logs(created_at desc);
