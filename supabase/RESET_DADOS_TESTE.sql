-- =========================================================
-- RESET DE DADOS DE TESTE - iFujão
-- Apaga: pets, contatos, match proofs, contact reveals, AI searches
-- Apaga arquivos do Storage: pet-photos, match-proofs
-- Mantém: sponsors, moderators, banned_users, schema, policies
--
-- ATENÇÃO: rode no SQL Editor do Supabase como service_role.
-- Não há rollback. Faça backup antes se tiver dados importantes.
-- =========================================================

begin;

-- 1. Limpar tabelas transacionais (ordem: dependências primeiro)
truncate table public.pet_match_proofs restart identity cascade;
truncate table public.contact_reveals     restart identity cascade;
truncate table public.pet_contacts         restart identity cascade;
truncate table public.ai_searches          restart identity cascade;
truncate table public.pets                 restart identity cascade;

-- 2. Limpar embeddings da IA de pets (se houver tabela auxiliar)
-- (ai_searches já cobre o histórico; embeddings ficam em pet_images/embeddings
--  gerenciados pelas edge functions. Se existir, descomente:)
-- truncate table public.pet_embeddings restart identity cascade;

commit;

-- =========================================================
-- STORAGE: arquivos em pet-photos e match-proofs
-- Use o script Node.js em scripts/reset-storage.ts
--
--   npx tsx scripts/reset-storage.ts
--
-- Ele usa SUPABASE_SERVICE_ROLE_KEY do .env/.env.local
-- e remove todos os objetos dos buckets pet-photos e
-- match-proofs.
-- =========================================================

-- 3. Verificação (rode separado pra confirmar que zerou):
-- select 'pets' as tabela, count(*) from public.pets
-- union all select 'pet_contacts',     count(*) from public.pet_contacts
-- union all select 'pet_match_proofs', count(*) from public.pet_match_proofs
-- union all select 'contact_reveals',  count(*) from public.contact_reveals
-- union all select 'ai_searches',      count(*) from public.ai_searches;
