-- ============================================================================
-- iFujão — Migração de PII: move `contact`/`ownerPhone` do payload público
-- para a tabela `pet_contacts` (RLS restrita a dono/reporter).
-- Idempotente: rode quantas vezes quiser.
-- ============================================================================

-- 1) Copia o contato para pet_contacts (não sobrescreve se já existir valor).
insert into public.pet_contacts (pet_id, contact)
select id, payload->>'contact'
from public.pets
where payload ? 'contact'
  and (payload->>'contact') is not null
  and (payload->>'contact') <> ''
on conflict (pet_id) do update set contact = excluded.contact;

-- 2) Remove a PII do payload público (já está em pet_contacts).
--    O gatilho set_updated_at atualiza updated_at; clientes re-puxarão no sync.
update public.pets
set payload = payload - 'contact' - 'ownerPhone'
where payload ? 'contact' or payload ? 'ownerPhone';
