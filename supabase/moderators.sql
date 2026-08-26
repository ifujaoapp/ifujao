-- ============================================================================
-- Modo Deus (moderação) — recria a tabela do zero.
-- Rode este arquivo no SQL Editor do Supabase. Ele apaga a tabela antiga,
-- cria nova + RLS (só service_role lê) e insere 1 moderador.
-- ============================================================================

drop table if exists public.moderators;

create table public.moderators (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- RLS: anon/authenticated não acessam; só a Edge Function (service_role) lê.
alter table public.moderators enable row level security;

drop policy if exists "moderators bloqueado para usuarios" on public.moderators;
create policy "moderators bloqueado para usuarios"
  on public.moderators for all to anon, authenticated
  using (false) with check (false);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.moderators to service_role;

-- Gere o hash (bcryptjs, JS puro):
--   npm i bcryptjs
--   node -e "const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1], 12))" "SUA_SENHA"
-- COLE o hash gerado no lugar de COLE_SEU_HASH_BCRYPT_AQUI:
insert into public.moderators (username, password_hash)
values ('admin', 'COLE_SEU_HASH_BCRYPT_AQUI');
