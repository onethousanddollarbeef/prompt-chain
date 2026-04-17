-- Prompt chain tables for humor flavors
create table if not exists public.humor_flavors (
  id bigserial primary key,
  created_datetime_utc timestamptz not null default now(),
  description text,
  slug varchar not null unique,
  created_by_user_id uuid not null references auth.users(id),
  modified_by_user_id uuid references auth.users(id),
  modified_datetime_utc timestamptz not null default now()
);

create table if not exists public.humor_flavor_steps (
  id bigserial primary key,
  created_datetime_utc timestamptz not null default now(),
  humor_flavor_id bigint not null references public.humor_flavors(id) on delete cascade,
  llm_temperature numeric,
  order_by int not null,
  llm_input_type_id int,
  llm_output_type_id int,
  llm_model_id int,
  humor_flavor_step_type_id int2,
  llm_system_prompt text,
  llm_user_prompt text,
  description varchar,
  created_by_user_id uuid references auth.users(id),
  modified_by_user_id uuid references auth.users(id),
  modified_datetime_utc timestamptz not null default now(),
  unique (humor_flavor_id, order_by)
);

create table if not exists public.humor_flavor_runs (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid not null references public.humor_flavors(id) on delete cascade,
  image_url text not null,
  response_json jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.humor_flavors enable row level security;
alter table public.humor_flavor_steps enable row level security;
alter table public.humor_flavor_runs enable row level security;

-- Admin gate: profiles.is_superadmin or profiles.is_matrix_admin
create policy "admins can manage flavors"
on public.humor_flavors
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
);

create policy "admins can manage steps"
on public.humor_flavor_steps
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
);

create policy "admins can manage runs"
on public.humor_flavor_runs
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
);
