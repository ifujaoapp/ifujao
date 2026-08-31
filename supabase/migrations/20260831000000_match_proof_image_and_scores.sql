-- Tier 1 + Tier 2 (2026-08-31): prova de posse estruturada + checagem de compatibilidade.
-- Aplica em bancos já criados a partir de schema.sql anterior (colunas/bug novos).

-- 1) Colunas de prova estruturada em pet_match_proofs.
alter table public.pet_match_proofs
  add column if not exists proof_image text,
  add column if not exists microchip   text;

-- 2) Bucket restrito de imagens de prova (anti-fraude).
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
