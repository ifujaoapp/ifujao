-- ============================================================================
-- iFujão — Schema de sincronização (cole no SQL Editor do Supabase e rode)
-- Idempotente: pode ser rodado mais de uma vez.
--
-- Revisão de segurança/performance (ver comentários "CORREÇÃO N" abaixo):
--   N1. UPDATE policy endurecida: owner_device_id e reporter_device_id são
--       imutáveis (defense-in-depth contra spoof de user_metadata).
--   N2. PII: contato sai do payload público para a tabela pet_contacts
--       (RLS restrita a owner/reporter, nunca pública).
--   N3. Removido GRANT DELETE em pets (o app só faz soft-delete via UPDATE).
--   N4. Índice parcial p/ registros ativos (deleted_at is null).
--   N5. Índice GIN em payload p/ filtros dentro do jsonb.
--   N6. id com default UUID + owner_device_id NOT NULL (quando não há nulos).
--   N7. Busca semântica (IA): coluna `embedding vector(3072)` + função
--       `match_pets` (pgvector + Gemini embeddings).
-- ============================================================================

-- Extensão pgvector (já disponível no Supabase).
create extension if not exists vector;

-- Tabela de pets (cada pet é um JSON em `payload`; colunas espelhadas p/ RLS/filtro)
create table if not exists public.pets (
  id text primary key,
  payload jsonb not null,
  owner_device_id text,
  reporter_device_id text,
  reported boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  found_at timestamptz,
  embedding vector(3072)
);

-- CORREÇÃO N6: default UUID para novas linhas (cliente ainda pode enviar o id;
-- isto evita colisão caso o client não gere). Tipo mantido `text` por
-- compatibilidade com ids legados — o app deve gerar UUID v4.
alter table public.pets alter column id set default gen_random_uuid();

-- CORREÇÃO N6: owner_device_id NOT NULL, mas só se não houver nulos legados
-- (evita abortar o script em bases já populadas). O app sempre define o owner
-- na criação; pets legados sem owner ficam excluídos do GRANT de escrita pela
-- policy de INSERT (owner_device_id = current_device_id()).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'owner_device_id'
  ) and not exists (
    select 1 from public.pets where owner_device_id is null
  ) then
    alter table public.pets alter column owner_device_id set not null;
  end if;
end $$;

create index if not exists pets_owner_idx on public.pets (owner_device_id);
create index if not exists pets_reporter_idx on public.pets (reporter_device_id);
create index if not exists pets_updated_idx on public.pets (updated_at);

-- Coluna top-level `found_at` (reencontro): idempotente p/ bases já populadas.
-- Permite filtrar/ordenar por "encontrado" via API normal (ex.:
-- ?found_at=not.is.null) em vez de cavar o jsonb do payload.
alter table public.pets add column if not exists found_at timestamptz;
create index if not exists pets_found_idx on public.pets (found_at);

-- Coluna top-level `post_type` (tipo de post): 'lost' = dono perdeu o pet;
-- 'found' = terceiro encontrou um pet perdido (fluxo de quem achou). Permite
-- filtrar posts de achados no mapa/feed via API normal (?post_type=eq.found)
-- sem cavar o jsonb do payload. Padrão 'lost' mantém registros legados como
-- posts de perda.
alter table public.pets add column if not exists post_type text default 'lost';
create index if not exists pets_post_type_idx on public.pets (post_type);

-- CORREÇÃO N4: listas ordenam por updated_at ignorando deletados. Índice
-- parcial evita varrer linhas soft-deletadas.
create index if not exists pets_active_idx
  on public.pets (updated_at desc) where deleted_at is null;

-- CORREÇÃO N5: filtros dentro do jsonb (ex.: espécie/cidade) não usam B-tree.
-- GIN com jsonb_path_ops acelera operadores @> (containment). Se o app filtrar
-- muito por um campo específico, prefira colunas geradas:
--   alter table public.pets add column if not exists species text
--     generated always as (payload->>'species') stored;
--   create index if not exists pets_species_idx on public.pets (species);
create index if not exists pets_payload_gin
  on public.pets using gin (payload jsonb_path_ops);

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

-- Soft-delete: garante deleted_at = now() do SERVIDOR quando o pet passa de
-- ativo (deleted_at nulo) para apagado. Assim o cursor de deleção do sync não
-- sofre com o relógio do cliente (device com hora errada fazia deletes caírem
-- "atrás" do cursor e nunca serem puxados por outros dispositivos).
create or replace function public.set_deleted_at()
returns trigger as $$
begin
  if OLD.deleted_at is null and NEW.deleted_at is not null then
    NEW.deleted_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pets_set_deleted_at on public.pets;
create trigger pets_set_deleted_at
  before update on public.pets
  for each row execute function public.set_deleted_at();

-- Retorna o device_id do usuário logado lendo auth.users.
-- SECURITY DEFINER: roda como dono do banco, então contorna a falta de
-- SELECT de auth.users pelas roles anon/authenticated.
-- NOTA DE SEGURANÇA: user_metadata é mutável pelo próprio cliente (updateUser).
-- Isto é usado apenas para identidade/STORAGE; a escrita em pets é endurecida
-- pela policy de UPDATE (ver N1). Para zero-trust, capture auth.uid()
-- imutável em owner_user_id no INSERT e autorize por ele.
-- IMPORTANTE: usa a chave `app_device_id` (NÃO `device_id`). O campo
-- `device_id` da metadata é RESERVADO pelo Gotrue para usuários anônimos:
-- ele sobrescreve com um UUID próprio (de forma intermitente), quebrando o
-- RLS de forma imprevisível. A app grava `app_device_id` no sign-in anônimo.
create or replace function public.current_device_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select raw_user_meta_data->>'app_device_id'
  from auth.users
  where id = auth.uid()
$$;

-- ============================================================================
-- CORREÇÃO N2: PII — contato (telefone) fora do payload público.
-- pet_contacts só é legível por owner/reporter autenticados. O app deve parar
-- de gravar `contact` dentro de `payload` e usar esta tabela.
-- ============================================================================
create table if not exists public.pet_contacts (
  pet_id text primary key references public.pets (id) on delete cascade,
  contact text not null,
  created_at timestamptz default now()
);

alter table public.pet_contacts enable row level security;

drop policy if exists "pet_contacts readable by owner/reporter" on public.pet_contacts;
create policy "pet_contacts readable by owner/reporter"
  on public.pet_contacts for select to authenticated
  using (
    exists (
      select 1 from public.pets p
      where p.id = pet_contacts.pet_id
        and (p.owner_device_id = public.current_device_id()
             or p.reporter_device_id = public.current_device_id())
    )
  );

drop policy if exists "pet_contacts owner write" on public.pet_contacts;
create policy "pet_contacts owner write"
  on public.pet_contacts for all to authenticated
  using (
    exists (
      select 1 from public.pets p
      where p.id = pet_contacts.pet_id
        and p.owner_device_id = public.current_device_id()
    )
  )
  with check (
    exists (
      select 1 from public.pets p
      where p.id = pet_contacts.pet_id
        and p.owner_device_id = public.current_device_id()
    )
  );

-- ============================================================================
-- Log de revelações de contato (rate-limit da Edge Function)
-- Só a service_role (Edge Function reveal-contact) escreve/lê aqui. Sem grant
-- para anon/authenticated e com RLS habilitada (sem policy) => negado a todos,
-- exceto service_role, que bypassa RLS.
-- ============================================================================
create table if not exists public.contact_reveals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  pet_id text not null,
  created_at timestamptz default now()
);

create index if not exists contact_reveals_user_idx
  on public.contact_reveals (user_id, created_at desc);

alter table public.contact_reveals enable row level security;

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
-- AVISO: select público expõe `payload`. NÃO armazene PII (telefone, e-mail)
-- no payload — use a tabela pet_contacts (acima), que é restrita.

drop policy if exists "pets insert own" on public.pets;
create policy "pets insert own"
  on public.pets for insert to authenticated
  with check (
    owner_device_id = public.current_device_id()
  );

-- CORREÇÃO N1: UPDATE endurecido + denúncia por finder.
-- Duas policies para conciliar "só dono apaga/edita" com "finder pode denunciar":
--
-- (A) pets update own: dono OU repórter editam e o dono apaga (soft-delete via
--     deleted_at). owner_device_id e reporter_device_id são IMUTÁVEIS (sem
--     sequestro de posse nem troca de quem denunciou).
--     REGRA DE DENÚNCIA: só o finder/reporter pode APAGAR a própria denúncia.
--     O dono do alerta NUNCA pode inverter reported de true->false (esconder a
--     denúncia de outra pessoa). Por isso o `with check` bloqueia o dono de
--     fazer reported=true->false, mas libera o repórter (owner_device_id <>
--     current) de denunciar e apagar livremente.
-- CORREÇÃO (2026-08-19): ANTES HAVIA DUAS policies de UPDATE ("pets update own" e
-- "pets report update"). O Postgres combina o WITH CHECK de policies permissivas
-- de UPDATE com AND — então o que passava numa falhava na outra (whack-a-mole).
-- SOLUÇÃO: UMA SÓ policy "pets update", cujo WITH CHECK é um OR explícito dos
-- casos válidos. Assim não há AND cruzado entre policies.
--   CASO A: dono edita CONTEÚDO (conteúdo livre) ou faz soft-delete.
--           repórter IMUTÁVEL; dono NÃO esconde denúncia alheia (reported true->false).
--   CASO B: finder denuncia 1ª vez (reporter null -> current, reported=true).
--   CASO C: o PRÓPRIO repórter confirma (reported=true) ou apaga (reported=false)
--           a própria denúncia; repórter inalterado.
-- IMPORTANTE: NÃO há comparação de `payload` nesta policy. O app, no ramo de
-- denúncia (lib/sync.ts), NÃO reescreve o `payload` — só atualiza as COLUNAS DE
-- TOPO (reported/reporter_device_id), que são a fonte autoritativa (toLocalPet
-- lê delas). Tentar comparar `payload` era frágil: o payload local do finder
-- divergia do do servidor (ex.: images como URI local vs URL remota) e barrava
-- a denúncia com "new row violates row-level security policy"; e reescrever o
-- payload corromperia o conteúdo. Conteúdo só muda pelo CASO A (dono).
-- Em todos os casos o owner_device_id é IMUTÁVEL (ninguém rouba posse).
drop policy if exists "pets update own" on public.pets;
drop policy if exists "pets report update" on public.pets;
drop policy if exists "pets update" on public.pets;
create policy "pets update"
  on public.pets for update to authenticated
  using (true)
  with check (
    owner_device_id = (select p.owner_device_id from public.pets p where p.id = pets.id)
    and (
      -- CASO A: dono edita conteúdo ou soft-delete.
      ( owner_device_id = public.current_device_id()
        and reporter_device_id is not distinct from (select p.reporter_device_id from public.pets p where p.id = pets.id)
        and ( owner_device_id <> public.current_device_id()
              or not ( (select p.reported from public.pets p where p.id = pets.id) = true
                       and reported = false ) )
      )
      -- CASO B: finder denuncia pela 1ª vez (reporter null -> current, reported=true).
      or ( (select p.reporter_device_id from public.pets p where p.id = pets.id) is null
           and owner_device_id <> public.current_device_id()
           and reporter_device_id = public.current_device_id()
           and reported = true
           and deleted_at is null )
      -- CASO C: o próprio repórter confirma (reported=true) ou apaga (reported=false) a denúncia.
      --   repórter inalterado. Só quem é o repórter pode; o dono continua travado
      --   de esconder denúncia alheia (não entra no CASO A).
      or ( (select p.reporter_device_id from public.pets p where p.id = pets.id) = public.current_device_id()
           and owner_device_id <> public.current_device_id()
           and reporter_device_id = public.current_device_id()
           and deleted_at is null )
    )
    -- MODO DEUS (moderação): JWT com claim is_moderator=true (Edge Function
    -- god-login) libera editar/apagar qualquer pet, ignorando device_id.
    or ( (auth.jwt() ->> 'is_moderator')::boolean is true )
  );

-- ============================================================================
-- Busca semântica (IA / pgvector + Gemini embeddings)
-- A Edge Function `search-pets` gera o embedding da consulta (Gemini) e chama
-- esta função (via service_role) para ranquear os pets por similaridade coseno.
-- SECURITY DEFINER: executa como dono, ignora RLS; só retorna pets ativos.
-- ============================================================================
-- NOTA: pgvector limita HNSW a 2000 dims; embedding é 3072, então não há
-- índice ANN. A busca usa `<=>` (scan exato), suficiente na escala do app.

 create or replace function public.match_pets(
  query_embedding vector(3072),
  match_count int default 20
)
returns table (
  id text,
  payload jsonb,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.payload,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.pets p
  where p.deleted_at is null
    and p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================================
-- Grants: as roles anon/authenticated precisam de acesso em nível de tabela
-- (a RLS cuida da linha; o GRANT cuida do objeto).
-- CORREÇÃO N3: removido DELETE em pets. O app faz soft-delete via
-- UPDATE (deleted_at), e não havia policy de DELETE — o grant era morto e
-- abria interpretação incorreta de permissão.
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.pets to anon, authenticated;
grant execute on function public.current_device_id() to anon, authenticated;
grant select, insert, update, delete on table public.pet_contacts to authenticated;
grant insert, delete on storage.objects to anon, authenticated;

-- A Edge Function reveal-contact usa service_role (bypassa RLS) para ler
-- pet_contacts e escrever contact_reveals. O service_role PRECISA de GRANT
-- explícito nessas tabelas, senão a query falha com "permission denied".
grant select, insert, update, delete on table public.pet_contacts to service_role;
grant select, insert, update, delete on table public.contact_reveals to service_role;
-- As Edge Functions embed-pets e search-pets usam service_role para ler/escrever
-- pets e chamar match_pets. O service_role PRECISA de GRANT explícito em pets,
-- senão a query falha com "permission denied for table pets".
grant select, insert, update, delete on table public.pets to service_role;
-- A Edge Function search-pets usa service_role para chamar match_pets (busca
-- semântica). Precisa de GRANT de EXECUTE na função.
grant execute on function public.match_pets(vector(3072), int) to service_role;

-- Tabela de auditoria/rate-limit das buscas por IA.
create table if not exists public.ai_searches (
  id bigserial primary key,
  user_id uuid not null,
  device_id text,
  query text,
  created_at timestamptz default now()
);
-- Idempotente: adiciona a coluna em bancos já existentes (não recria a tabela).
alter table if exists public.ai_searches add column if not exists device_id text;
create index if not exists ai_searches_device_day_idx
  on public.ai_searches (device_id, created_at);
grant insert on table public.ai_searches to service_role;

-- ============================================================================
-- Provas de posse de match (anti-fraude): tabela RESTRITA.
-- Espelha o padrão de `pet_contacts`: só as duas partes da match (dono do
-- perdido que reclamou e dono do achado) e a moderação (service_role) leem/escrevem.
-- NUNCA vai no `payload` público de `pets` (evita expor PII / fotos de terceiros).
-- Uma linha por pet perdido que reclamou um achado.
-- ============================================================================
create table if not exists public.pet_match_proofs (
  pet_id               text primary key references public.pets (id) on delete cascade,
  found_pet_id         text not null,
  claimer_device_id    text not null,
  found_owner_device_id text not null,
  -- Prova de posse estruturada (anti-fraude):
  --  * proof_image: caminho do objeto no bucket RESTRITO 'match-proofs'
  --    (ex.: "<device_id>/<arquivo>.jpg"). Lido via URL assinada pelas partes.
  --  * microchip: nº de microchip informado pelo reclamante (validado no app).
  --  * proof: observações livres (texto/foto descritiva) — opcional.
  proof_image          text,
  microchip            text,
  proof                text,
  disputed             boolean default false,
  created_at           timestamptz default now()
);

alter table public.pet_match_proofs enable row level security;

drop policy if exists "match_proofs readable by parties" on public.pet_match_proofs;
create policy "match_proofs readable by parties"
  on public.pet_match_proofs for select to authenticated
  using (
    claimer_device_id = public.current_device_id()
    or found_owner_device_id = public.current_device_id()
  );

drop policy if exists "match_proofs claimer write" on public.pet_match_proofs;
create policy "match_proofs claimer write"
  on public.pet_match_proofs for all to authenticated
  using (claimer_device_id = public.current_device_id())
  with check (claimer_device_id = public.current_device_id());

grant select, insert, update, delete on table public.pet_match_proofs to authenticated;
grant all on table public.pet_match_proofs to service_role;

-- ============================================================================
-- Storage: bucket RESTRITO de provas de posse (anti-fraude).
-- Diferente de 'pet-photos' (público), aqui o objeto NÃO é servido por URL
-- pública: só as duas partes da match (reclamante e dono do achado) e a
-- moderação (service_role) conseguem ler, via URL assinada. A policy de read
-- cruza o path do objeto com a linha de pet_match_proofs cujo proof_image aponta
-- para ele, liberando apenas quando o device é uma das partes.
-- Os uploads ficam em "<claimer_device_id>/<arquivo>", então o dono da prova
-- (reclamante) sempre pode ler/apagar as próprias fotos.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('match-proofs', 'match-proofs', false)
on conflict (id) do nothing;

drop policy if exists "match-proofs claimer insert" on storage.objects;
create policy "match-proofs claimer insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'match-proofs'
    and (storage.foldername(name))[1] = public.current_device_id()
  );

drop policy if exists "match-proofs parties read" on storage.objects;
create policy "match-proofs parties read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'match-proofs'
    and (
      (storage.foldername(name))[1] = public.current_device_id()
      or exists (
        select 1 from public.pet_match_proofs m
        where m.proof_image = storage.objects.name
          and (m.claimer_device_id = public.current_device_id()
               or m.found_owner_device_id = public.current_device_id())
      )
    )
  );

drop policy if exists "match-proofs owner delete" on storage.objects;
create policy "match-proofs owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'match-proofs'
    and (storage.foldername(name))[1] = public.current_device_id()
  );

-- ============================================================================
-- IMPORTANTE: ative o "Anonymous Sign-ins" em
--   Authentication -> Providers -> Anonymous (toggle ON)
-- ============================================================================
