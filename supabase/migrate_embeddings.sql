-- ============================================================================
-- iFujão — Busca semântica (IA / Gemini embeddings + pgvector)
-- Cole no SQL Editor do Supabase e rode UMA vez. Idempotente.
--
-- Pré-requisito: a tabela `pets` já existe (schema.sql). Este script só
-- adiciona a coluna de embedding, o índice e a função de busca — NÃO recria
-- tabelas, então é seguro rodar em produção com dados.
-- ============================================================================

-- Extensão pgvector (já disponível no Supabase).
create extension if not exists vector;

-- Coluna de embedding (Gemini gemini-embedding-001 => 3072 dimensões).
alter table public.pets add column if not exists embedding vector(3072);
-- O índice HNSW antigo (se existir, em 768) bloqueia o ALTER de tipo; derruba.
drop index if exists public.pets_embedding_idx;
-- Se a coluna já existia com outra dimensão (ex.: 768), converte para 3072.
alter table public.pets alter column embedding type vector(3072)
  using embedding::vector(3072);

-- NOTA: o pgvector limita HNSW a 2000 dimensões; como o embedding é 3072,
-- NÃO criamos índice ANN. A busca usa `<=>` (scan exato), instantânea na
-- escala deste app. Se um dia usar modelo <=2000 dims, adicione:
--   create index if not exists pets_embedding_idx
--     on public.pets using hnsw (embedding vector_cosine_ops);

-- Ranqueia pets por similaridade coseno com o embedding da consulta.
-- SECURITY DEFINER: executa como dono, ignora RLS; só retorna pets ativos.
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

-- A Edge Function embed-pets (backfill) e search-pets usam service_role para
-- ler/escrever pets e chamar match_pets. O service_role PRECISA de GRANT
-- explícito em pets (senão a query falha com "permission denied").
grant select, insert, update, delete on table public.pets to service_role;
grant execute on function public.match_pets(vector(3072), int) to service_role;

-- Tabela de auditoria/rate-limit das buscas por IA.
create table if not exists public.ai_searches (
  id bigserial primary key,
  user_id uuid not null,
  query text,
  created_at timestamptz default now()
);
grant insert on table public.ai_searches to service_role;

-- ============================================================================
-- Backfill: após rodar este script, gere os embeddings dos pets existentes.
-- Basta chamar a Edge Function `embed-pets` sem body (ela preenche todos os
-- pets cujo `embedding` é NULL), ou pet a pet: `embed-pets` com { "pet_id": "..." }.
-- Pets novos/atualizados já ganham embedding automaticamente no push do app.
-- ============================================================================
