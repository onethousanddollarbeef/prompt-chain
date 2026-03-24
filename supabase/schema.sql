-- Prompt chain tables for humor flavors
create table if not exists public.humor_flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.humor_flavor_steps (
  id uuid primary key default gen_random_uuid(),
  flavor_id uuid not null references public.humor_flavors(id) on delete cascade,
  position int not null,
  title text not null,
  instruction text not null,
  created_at timestamptz not null default now(),
  unique (flavor_id, position)
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
