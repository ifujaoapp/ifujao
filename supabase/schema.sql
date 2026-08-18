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

-- Retorna o device_id do usuário logado lendo auth.users.
-- SECURITY DEFINER: roda como dono do banco, então contorna a falta de
-- SELECT de auth.users pelas roles anon/authenticated.
-- NOTA DE SEGURANÇA: user_metadata é mutável pelo próprio cliente (updateUser).
-- Isto é usado apenas para identidade/STORAGE; a escrita em pets é endurecida
-- pela policy de UPDATE (ver N1). Para zero-trust, capture auth.uid()
-- imutável em owner_user_id no INSERT e autorize por ele.
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
-- (A) pets update own: dono OU repórter editam o conteúdo e o dono apaga
--     (soft-delete via deleted_at). owner_device_id é IMUTÁVEL (sem sequestro
--     de posse) e reporter_device_id é IMUTÁVEL (mantém quem reportou).
drop policy if exists "pets update own" on public.pets;
create policy "pets update own"
  on public.pets for update to authenticated
  using (
    owner_device_id = public.current_device_id()
    or reporter_device_id = public.current_device_id()
  )
  with check (
    owner_device_id = (select p.owner_device_id from public.pets p where p.id = pets.id)
    and (
      reporter_device_id is null
      or reporter_device_id = (select p.reporter_device_id from public.pets p where p.id = pets.id)
    )
  );

-- (B) pets report update: finder (não dono, não repórter) só pode DENUNCIAR —
-- ou seja, definir reported=true e reporter_device_id=si mesmo, sem mexer na
-- posse, sem apagar (deleted_at deve continuar nulo) e apenas na 1ª denúncia
-- (reporter_device_id precisava estar nulo).
-- CONTEÚDO PROTEGIDO: exige que o conteúdo do pet (espécie, local, descrição,
-- fotos, coordenadas, data) não mude — só os campos de denúncia. Assim o finder
-- denuncia mas não "picha" o alerta alheio via API. Comparamos o payload sem as
-- chaves de sync/denúncia; as chaves de conteúdo precisam ser idênticas.
drop policy if exists "pets report update" on public.pets;
create policy "pets report update"
  on public.pets for update to authenticated
  using (true)
  with check (
    owner_device_id = (select p.owner_device_id from public.pets p where p.id = pets.id)
    and deleted_at is null
    and (select p.reporter_device_id from public.pets p where p.id = pets.id) is null
    and reporter_device_id = public.current_device_id()
    and reported = true
    and (
      payload - '{id,contact,ownerPhone,ownerDeviceId,reporterDeviceId,reported,reportReason,reportedBy,dirty,remoteImageUrls,updatedAt,deletedAt}'::text[]
    ) = (
      (select p.payload from public.pets p where p.id = pets.id)
      - '{id,contact,ownerPhone,ownerDeviceId,reporterDeviceId,reported,reportReason,reportedBy,dirty,remoteImageUrls,updatedAt,deletedAt}'::text[]
    )
  );

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

-- ============================================================================
-- IMPORTANTE: ative o "Anonymous Sign-ins" em
--   Authentication -> Providers -> Anonymous (toggle ON)
-- ============================================================================
