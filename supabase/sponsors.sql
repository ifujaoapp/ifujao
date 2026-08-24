-- Tabela de patrocinadores (pins no mapa do iFujão).
-- Arquivo IDEMPOTENTE: pode ser rodado quantas vezes quiser no SQL Editor
-- (o create table é `if not exists`, as policies fazem `drop` antes do
-- `create`, e os índices/grant são repetíveis).
--
-- Segurança:
--   * Leitura: PÚBLICA (anon) — o app mobile precisa listar os pins.
--   * Escrita (insert/update/delete): só usuários NÃO anônimos (admin por
--     e-mail/senha). O app mobile faz sign-in ANÔNIMO, então seus usuários
--     também caem no role `authenticated`; bloqueamos eles checando a claim
--     `is_anonymous` do JWT (ausente/false para login por e-mail/senha).

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  link text,
  phone text,
  instagram text,
  facebook text,
  logo text,
  active boolean not null default true,
  visible_from date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Se a tabela já existir sem a coluna (deploy anterior), adicione-a de forma
-- idempotente. Em projeto novo o create acima já traz a coluna.
alter table public.sponsors add column if not exists visible_from date;

-- Migração: bases que já tinham `visible_from` como timestamptz (versão
-- anterior) são convertidas para `date`, preservando o DIA de calendário em
-- fuso local (São Paulo). Assim o pin some exatamente à meia-noite local do
-- dia seguinte, sem off-by-one de fuso e sem desaparecer cedo (ex.: 21h).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sponsors'
      and column_name = 'visible_from'
      and data_type = 'timestamp with time zone'
  ) then
    alter table public.sponsors
      alter column visible_from type date
      using ((visible_from at time zone 'America/Sao_Paulo')::date);
  end if;
end $$;
alter table public.sponsors add column if not exists phone text;
alter table public.sponsors add column if not exists instagram text;
alter table public.sponsors add column if not exists facebook text;
alter table public.sponsors add column if not exists logo text;

-- Bucket de logos dos patrocinadores (imagem real, sob nosso controle).
-- O app exibe a URL pública estável do Storage (não uma URL externa que
-- pode sumir). Bucket PÚBLICO para leitura via URL; escrita só admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsor-logos', 'sponsor-logos', true, 2097152, '{image/png,image/jpeg,image/webp,image/gif}')
on conflict (id) do nothing;

drop policy if exists "sponsor logos admin write" on storage.objects;
drop policy if exists "sponsor logos admin insert" on storage.objects;
create policy "sponsor logos admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sponsor-logos' and (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true);

drop policy if exists "sponsor logos admin update" on storage.objects;
create policy "sponsor logos admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'sponsor-logos' and (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true)
  with check (bucket_id = 'sponsor-logos' and (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true);

drop policy if exists "sponsor logos admin delete" on storage.objects;
create policy "sponsor logos admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sponsor-logos' and (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true);

alter table public.sponsors enable row level security;

drop policy if exists "sponsors public read" on public.sponsors;
create policy "sponsors public read"
  on public.sponsors for select to anon, authenticated
  using (true);

drop policy if exists "sponsors admin write" on public.sponsors;
create policy "sponsors admin write"
  on public.sponsors for all to authenticated
  using ( (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true )
  with check ( (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true );

create index if not exists sponsors_active_idx on public.sponsors (active);
create index if not exists sponsors_visible_from_idx on public.sponsors (visible_from);

-- Gatilho que atualiza `updated_at` a cada UPDATE (igual ao da tabela `pets`).
-- Sem isso, editar um patrocinador no admin não mexia no `updated_at` e o
-- delta de sync do app (`fetchSponsorsDelta`) não detectava a alteração.
-- A função `public.set_updated_at` já existe (criada em schema.sql).
drop trigger if exists sponsors_set_updated_at on public.sponsors;
create trigger sponsors_set_updated_at
  before update on public.sponsors
  for each row execute function public.set_updated_at();

grant usage on schema public to anon, authenticated;
grant select on table public.sponsors to anon, authenticated;
grant insert, update, delete on table public.sponsors to authenticated;
