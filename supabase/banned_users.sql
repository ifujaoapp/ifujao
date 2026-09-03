-- ============================================================================
-- Sistema de banimento de usuarios (modo deus).
-- Banir por device_id OU por phone (pelo menos um). O unbanned_at marca
-- quando o banimento foi liberado (NULL = banido, setado = livre).
-- ============================================================================

create table if not exists public.banned_users (
  id uuid primary key default gen_random_uuid(),
  -- Pelo menos um dos dois precisa estar preenchido (checado em CHECK).
  device_id text,
  phone text,
  banned_by text not null,
  banned_at timestamptz not null default now(),
  reason text,
  -- Quando setado, o banimento foi liberado.
  unbanned_at timestamptz,
  unbanned_by text,
  -- Audit: updated_at para ultima alteracao.
  updated_at timestamptz not null default now(),
  -- Exatamente um dos dois precisa estar setado (impede criar linha vazia).
  constraint banned_users_either_device_or_phone
    check (device_id is not null or phone is not null)
);

-- Indices unicos parciais (permite multiplas linhas com o mesmo campo NULL,
-- mas so UMA linha ativa por device_id ou phone).
create unique index if not exists banned_users_device_id_active
  on public.banned_users (device_id)
  where device_id is not null and unbanned_at is null;
create unique index if not exists banned_users_phone_active
  on public.banned_users (phone)
  where phone is not null and unbanned_at is null;

-- Indice de busca por device_id/phone (para a checagem no startup).
create index if not exists banned_users_device_id_idx
  on public.banned_users (device_id) where device_id is not null;
create index if not exists banned_users_phone_idx
  on public.banned_users (phone) where phone is not null;

-- RLS
alter table public.banned_users enable row level security;

-- Qualquer usuario (anon/authenticated) pode checar se esta banido (SELECT).
-- Isso e necessario para a checagem no startup do app.
drop policy if exists "banned_users select publico" on public.banned_users;
create policy "banned_users select publico"
  on public.banned_users for select to anon, authenticated
  using (true);

-- Escrita (INSERT/UPDATE/DELETE) so via service_role (Edge Function).
drop policy if exists "banned_users bloqueado para usuarios" on public.banned_users;
create policy "banned_users bloqueado para usuarios"
  on public.banned_users for all to anon, authenticated
  using (false) with check (false);

-- service_role bypassa RLS por padrao, mas garantimos o grant.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.banned_users to service_role;
