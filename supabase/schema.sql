-- ============================================================================
-- iFujão — Schema de sincronização (cole no SQL Editor do Supabase e rode)
-- Idempotente: pode ser rodado mais de uma vez.
-- ============================================================================

-- Tabela de pets (cada pet é um JSON em `payload`; colunas espelhadas p/ RLS/filtro)
create table if not exists public.pets (
  id text primary key,
  payload jsonb not null,
  owner_device_id text,
  reporter_device_id text,
  reported boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists pets_owner_idx on public.pets (owner_device_id);
create index if not exists pets_reporter_idx on public.pets (reporter_device_id);
create index if not exists pets_updated_idx on public.pets (updated_at);

-- Atualiza updated_at a cada UPDATE
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists pets_set_updated_at on public.pets;
create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function public.set_updated_at();

-- Retorna o device_id do usuário logado lendo auth.users.
-- SECURITY DEFINER: roda como dono do banco, então contorna a falta de
-- SELECT de auth.users pelas roles anon/authenticated.
create or replace function public.current_device_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select raw_user_meta_data->>'device_id'
  from auth.users
  where id = auth.uid()
$$;

-- ============================================================================
-- Storage: bucket público de fotos
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', true)
on conflict (id) do nothing;

-- Bucket público: arquivos servidos via URL pública (sem RLS de storage).
-- Sem política/grant de SELECT para anon/authenticated => clientes não conseguem
-- listar (enumerar) os arquivos do bucket. Upload/exclusão mantêm suas policies.
drop policy if exists "pet-photos public read" on storage.objects;

drop policy if exists "pet-photos authed insert" on storage.objects;
create policy "pet-photos authed insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-photos');

-- Só o dono (device_id) pode apagar suas fotos. Os uploads ficam em
-- "<device_id>/<arquivo>", então a 1ª pasta da key == current_device_id().
drop policy if exists "pet-photos owner delete" on storage.objects;
create policy "pet-photos owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = public.current_device_id());

-- ============================================================================
-- RLS na tabela pets
-- ============================================================================
alter table public.pets enable row level security;

drop policy if exists "pets public read" on public.pets;
create policy "pets public read"
  on public.pets for select
  using (true);

drop policy if exists "pets insert own" on public.pets;
create policy "pets insert own"
  on public.pets for insert to authenticated
  with check (
    owner_device_id = public.current_device_id()
  );

drop policy if exists "pets update own" on public.pets;
create policy "pets update own"
  on public.pets for update to authenticated
  using (
    owner_device_id = public.current_device_id()
    or reporter_device_id = public.current_device_id()
  )
  with check (
    owner_device_id = public.current_device_id()
    or reporter_device_id = public.current_device_id()
  );

-- ============================================================================
-- Grants: as roles anon/authenticated precisam de acesso em nível de tabela
-- (a RLS cuida da linha; o GRANT cuida do objeto).
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pets to anon, authenticated;
grant execute on function public.current_device_id() to anon, authenticated;
grant insert, delete on storage.objects to anon, authenticated;

-- ============================================================================
-- IMPORTANTE: ative o "Anonymous Sign-ins" em
--   Authentication -> Providers -> Anonymous (toggle ON)
-- ============================================================================
