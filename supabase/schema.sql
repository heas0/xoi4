-- Run this file in the Supabase SQL editor before enabling VITE_SUPABASE_* env vars.

create table if not exists public.worlds (
  id text primary key,
  schema_version integer not null default 1,
  map_version text not null,
  updated_at timestamptz not null default now(),
  constraint worlds_id_not_empty check (length(trim(id)) > 0),
  constraint worlds_schema_version_positive check (schema_version > 0)
);

create table if not exists public.world_groups (
  world_id text not null references public.worlds(id) on delete cascade,
  id text not null,
  name text not null,
  color text not null,
  capital_region_id text,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (world_id, id),
  constraint world_groups_id_not_empty check (length(trim(id)) > 0),
  constraint world_groups_name_not_empty check (length(trim(name)) > 0),
  constraint world_groups_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.region_ownership (
  world_id text not null references public.worlds(id) on delete cascade,
  region_id text not null,
  group_id text not null default 'none',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  client_id text,
  primary key (world_id, region_id),
  constraint region_ownership_region_id_not_empty check (length(trim(region_id)) > 0),
  constraint region_ownership_group_id_not_empty check (length(trim(group_id)) > 0),
  constraint region_ownership_version_positive check (version > 0)
);

create index if not exists world_groups_active_idx
  on public.world_groups (world_id)
  where deleted_at is null;

create index if not exists region_ownership_group_idx
  on public.region_ownership (world_id, group_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists worlds_set_updated_at on public.worlds;
create trigger worlds_set_updated_at
before update on public.worlds
for each row execute function public.set_updated_at();

drop trigger if exists world_groups_set_updated_at on public.world_groups;
create trigger world_groups_set_updated_at
before update on public.world_groups
for each row execute function public.set_updated_at();

drop trigger if exists region_ownership_set_updated_at on public.region_ownership;
create trigger region_ownership_set_updated_at
before update on public.region_ownership
for each row execute function public.set_updated_at();

create or replace function public.set_region_group(
  p_world_id text,
  p_region_id text,
  p_group_id text,
  p_client_id text default null
)
returns public.region_ownership
language plpgsql
security definer
set search_path = public
as $$
declare
  changed public.region_ownership;
begin
  if length(trim(coalesce(p_world_id, ''))) = 0 then
    raise exception 'world id is required';
  end if;

  if length(trim(coalesce(p_region_id, ''))) = 0 then
    raise exception 'region id is required';
  end if;

  if length(trim(coalesce(p_group_id, ''))) = 0 then
    raise exception 'group id is required';
  end if;

  insert into public.worlds (id, schema_version, map_version)
  values (p_world_id, 1, 'unknown')
  on conflict (id) do nothing;

  insert into public.region_ownership as current_row (
    world_id,
    region_id,
    group_id,
    version,
    client_id
  )
  values (
    p_world_id,
    p_region_id,
    p_group_id,
    1,
    p_client_id
  )
  on conflict (world_id, region_id)
  do update set
    group_id = excluded.group_id,
    version = current_row.version + 1,
    client_id = excluded.client_id,
    updated_at = now()
  returning * into changed;

  update public.worlds
  set updated_at = now()
  where id = p_world_id;

  return changed;
end;
$$;

create or replace function public.remove_group(
  p_world_id text,
  p_group_id text,
  p_client_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_group_id = 'none' then
    raise exception 'the none group cannot be removed';
  end if;

  insert into public.worlds (id, schema_version, map_version)
  values (p_world_id, 1, 'unknown')
  on conflict (id) do nothing;

  insert into public.world_groups (
    world_id,
    id,
    name,
    color,
    deleted_at
  )
  values (
    p_world_id,
    p_group_id,
    p_group_id,
    '#FFFFFF',
    now()
  )
  on conflict (world_id, id)
  do update set
    deleted_at = now(),
    updated_at = now();

  update public.region_ownership
  set
    group_id = 'none',
    version = version + 1,
    client_id = p_client_id,
    updated_at = now()
  where world_id = p_world_id
    and group_id = p_group_id;

  update public.worlds
  set updated_at = now()
  where id = p_world_id;
end;
$$;

create or replace function public.set_group_capital(
  p_world_id text,
  p_group_id text,
  p_region_id text
)
returns public.world_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  changed public.world_groups;
begin
  if not exists (
    select 1
    from public.region_ownership
    where world_id = p_world_id
      and region_id = p_region_id
      and group_id = p_group_id
  ) then
    raise exception 'capital region must belong to the group';
  end if;

  insert into public.world_groups (
    world_id,
    id,
    name,
    color,
    capital_region_id,
    deleted_at
  )
  values (
    p_world_id,
    p_group_id,
    p_group_id,
    '#FFFFFF',
    p_region_id,
    null
  )
  on conflict (world_id, id)
  do update set
    capital_region_id = excluded.capital_region_id,
    deleted_at = null,
    updated_at = now()
  returning * into changed;

  update public.worlds
  set updated_at = now()
  where id = p_world_id;

  return changed;
end;
$$;

alter table public.worlds enable row level security;
alter table public.world_groups enable row level security;
alter table public.region_ownership enable row level security;

drop policy if exists "public read worlds" on public.worlds;
create policy "public read worlds"
on public.worlds for select
to anon, authenticated
using (true);

drop policy if exists "public write worlds" on public.worlds;
create policy "public write worlds"
on public.worlds for insert
to anon, authenticated
with check (true);

drop policy if exists "public update worlds" on public.worlds;
create policy "public update worlds"
on public.worlds for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public read groups" on public.world_groups;
create policy "public read groups"
on public.world_groups for select
to anon, authenticated
using (true);

drop policy if exists "public write groups" on public.world_groups;
create policy "public write groups"
on public.world_groups for insert
to anon, authenticated
with check (true);

drop policy if exists "public update groups" on public.world_groups;
create policy "public update groups"
on public.world_groups for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public read ownership" on public.region_ownership;
create policy "public read ownership"
on public.region_ownership for select
to anon, authenticated
using (true);

drop policy if exists "public write ownership" on public.region_ownership;
create policy "public write ownership"
on public.region_ownership for insert
to anon, authenticated
with check (true);

drop policy if exists "public update ownership" on public.region_ownership;
create policy "public update ownership"
on public.region_ownership for update
to anon, authenticated
using (true)
with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.worlds to anon, authenticated;
grant select, insert, update on public.world_groups to anon, authenticated;
grant select, insert, update on public.region_ownership to anon, authenticated;
grant execute on function public.set_region_group(text, text, text, text) to anon, authenticated;
grant execute on function public.remove_group(text, text, text) to anon, authenticated;
grant execute on function public.set_group_capital(text, text, text) to anon, authenticated;

alter table public.world_groups replica identity full;
alter table public.region_ownership replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'world_groups'
    ) then
      alter publication supabase_realtime add table public.world_groups;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'region_ownership'
    ) then
      alter publication supabase_realtime add table public.region_ownership;
    end if;
  end if;
end;
$$;
