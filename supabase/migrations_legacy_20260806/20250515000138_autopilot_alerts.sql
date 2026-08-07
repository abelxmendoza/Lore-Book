-- Autopilot alerts persistence
create table if not exists autopilot_alerts (
  id serial primary key,
  user_id uuid references auth.users(id) on delete cascade,
  alert_type text not null,
  risk_level int not null,
  evidence jsonb default '[]'::jsonb,
  resolved boolean default false,
  created_at timestamp without time zone default now()
);

create index if not exists autopilot_alerts_user_idx on autopilot_alerts(user_id);
