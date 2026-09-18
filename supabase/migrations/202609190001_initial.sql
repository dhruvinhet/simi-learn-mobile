create extension if not exists pgcrypto;

create table if not exists public.generation_requests (
  request_id text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  client_hash text not null,
  topic_hash text not null,
  status text not null check (status in ('processing','complete','rejected')),
  response jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists generation_requests_owner_idx on public.generation_requests(owner_id, status);
create index if not exists generation_requests_client_idx on public.generation_requests(client_hash, status);

create table if not exists public.lesson_feedback (
  id uuid primary key default gen_random_uuid(),
  lesson_id text not null,
  owner_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  quiz_score smallint,
  quiz_total smallint,
  rating smallint,
  generation_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists lesson_feedback_lesson_idx on public.lesson_feedback(lesson_id, created_at);

create table if not exists public.entitlements (
  app_user_id text not null,
  entitlement_id text not null,
  product_id text,
  store text,
  active boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (app_user_id, entitlement_id)
);

create table if not exists public.revenuecat_events (
  event_id text primary key,
  event_type text not null,
  app_user_id text not null,
  received_at timestamptz not null default now()
);

alter table public.generation_requests enable row level security;
alter table public.lesson_feedback enable row level security;
alter table public.entitlements enable row level security;
alter table public.revenuecat_events enable row level security;

-- Edge Functions use the service role. Mobile clients never read or mutate these tables directly.
revoke all on public.generation_requests from anon, authenticated;
revoke all on public.lesson_feedback from anon, authenticated;
revoke all on public.entitlements from anon, authenticated;
revoke all on public.revenuecat_events from anon, authenticated;
