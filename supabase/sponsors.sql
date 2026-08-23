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
  visible_from timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Se a tabela já existir sem a coluna (deploy anterior), adicione-a de forma
-- idempotente. Em projeto novo o create acima já traz a coluna.
alter table public.sponsors add column if not exists visible_from timestamptz;
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
create policy "sponsor logos admin write"
  on storage.objects for insert, update, delete to authenticated
  using (bucket_id = 'sponsor-logos' and (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true)
  with check (bucket_id = 'sponsor-logos' and (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true);

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

grant usage on schema public to anon, authenticated;
grant select on table public.sponsors to anon, authenticated;
grant insert, update, delete on table public.sponsors to authenticated;
