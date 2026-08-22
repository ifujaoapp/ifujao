-- Tabela de patrocinadores (pins no mapa do iFujão).
-- Reaplicar no Supabase (SQL Editor) uma única vez.
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
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sponsors enable row level security;

create policy "sponsors public read"
  on public.sponsors for select to anon, authenticated
  using (true);

create policy "sponsors admin write"
  on public.sponsors for all to authenticated
  using ( (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true )
  with check ( (auth.jwt() ->> 'is_anonymous')::boolean is distinct from true );

create index if not exists sponsors_active_idx on public.sponsors (active);

grant usage on schema public to anon, authenticated;
grant select on table public.sponsors to anon, authenticated;
grant insert, update, delete on table public.sponsors to authenticated;
