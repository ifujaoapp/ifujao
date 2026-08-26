import * as SecureStore from 'expo-secure-store';
import { ensureSession, isSupabaseConfigured } from './supabase';
import { uploadPetPhotos } from './photos';
import { embedPet } from './embed';
import { type PetRecord } from './storage';

const PENDING_DELETES_KEY = 'ifujao_pending_deletes';
const LAST_SYNC_KEY = 'ifujao_last_sync';

export const getPendingDeletes = async (): Promise<string[]> => {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_DELETES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

export const addPendingDelete = async (id: string): Promise<void> => {
  const list = await getPendingDeletes();
  if (!list.includes(id)) {
    list.push(id);
    await SecureStore.setItemAsync(PENDING_DELETES_KEY, JSON.stringify(list));
  }
};

const clearPendingDeletes = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(PENDING_DELETES_KEY).catch(() => {});
};

const getLastSync = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(LAST_SYNC_KEY);
  } catch {
    return null;
  }
};

const setLastSync = async (iso: string): Promise<void> => {
  await SecureStore.setItemAsync(LAST_SYNC_KEY, iso).catch(() => {});
};

// Converte um registro remoto (linha da tabela) num PetRecord local.
// Usa as URLs remotas diretamente nas imagens (viewer suporta https).
const toLocalPet = (row: any): PetRecord => {
  const pet = (row.payload ?? {}) as PetRecord;
  const remoteUrls: string[] = pet.remoteImageUrls && pet.remoteImageUrls.length ? pet.remoteImageUrls : [];
  // As colunas de topo são a fonte autoritativa do estado de denúncia/posse:
  // o finder atualiza SÓ essas colunas (a policy impede mexer no conteúdo do
  // payload), então ler do payload deixaria a bandeira invisível no mapa.
  return {
    ...pet,
    // `id` vem da chave primária da tabela (row.id), NÃO do payload — o payload
    // nem sempre traz o id, e sem ele o savePets (op-sqlite, coluna NOT NULL)
    // quebra com "NOT NULL constraint failed: pets.id".
    id: (row.id as string | undefined) ?? pet.id,
    ownerDeviceId: (row.owner_device_id as string | undefined) ?? pet.ownerDeviceId,
    reporterDeviceId: (row.reporter_device_id as string | undefined) ?? pet.reporterDeviceId,
    reported: (row.reported as boolean) ?? pet.reported ?? false,
    foundAt: ((row.found_at as string) ?? pet.foundAt ?? null) as string | null,
    images: remoteUrls.length > 0 ? remoteUrls : (pet.images ?? []),
    remoteImageUrls: remoteUrls,
    dirty: false,
    updatedAt: row.updated_at ?? pet.updatedAt,
    deletedAt: row.deleted_at ?? null,
  };
};

// Busca o payload completo de UM pet no backend (fetch-on-tap).
// Útil para abrir o detalhe sem precisar ter baixado tudo.
export const fetchPetRemote = async (id: string): Promise<PetRecord | null> => {
  const sb = await ensureSession();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('pets').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    if (data.deleted_at) return null;
    const pet = toLocalPet(data);
    // Contato (PII) só vem de pet_contacts se o device for dono/reporter
    // (RLS cuida). Finder revela via Edge Function em lib/contacts.ts.
    const { data: c } = await sb
      .from('pet_contacts')
      .select('contact')
      .eq('pet_id', id)
      .maybeSingle();
    if (c?.contact) pet.contact = c.contact;
    return pet;
  } catch (e) {
    console.warn('[sync] fetchPetRemote erro:', e);
    return null;
  }
};

// Sincroniza o estado local com o backend.
// Estratégia local-first + INCREMENTAL: não relê a tabela inteira — só o delta
// desde `lastSync` (updated_at ou deleted_at). Isso evita estourar o plano de
// tráfego mesmo com milhares de pins.
export const runSync = async (
  localPets: PetRecord[],
  deviceId: string,
  onPersist: (pets: PetRecord[]) => Promise<void>,
  options?: { full?: boolean }
): Promise<PetRecord[]> => {
  const sb = await ensureSession(deviceId);
  if (!sb) return localPets;

  const failedIds = new Set<string>();
  const working = localPets.map((p) => ({ ...p }));

  // Migra pets legados (sem updatedAt) marcando como dirty para subir no primeiro sync.
  for (const p of working) {
    if (!p.updatedAt) p.dirty = true;
  }

  // 1) Push dos pets alterados
  for (const pet of working) {
    if (!pet.dirty) continue;

    // Quem está DENUNCIANDO (reporter_device_id === deviceId) — seja um finder
    // comum ou o próprio dono de OUTRO alerta — só pode DENUNCIAR
    // (reported=true) ou APAGAR a própria denúncia (reported=false). Em nenhum
    // dos dois casos mexe no CONTEÚDO do payload (policy "pets report update"
    // / "pets update own" exigem conteúdo inalterado). O dono NÃO pode apagar a
    // denúncia de outra pessoa — isso é travado na policy "pets update own".
    // Não usa upsert (bateria na policy "pets insert own"). O branch cobre
    // qualquer denunciante (inclusive dono), via `.update()` direto.
    if (pet.reporterDeviceId === deviceId) {
      try {
        const now = new Date().toISOString();
        // SÓ atualiza as COLUNAS DE TOPO (fonte autoritativa da denúncia).
        // NÃO reescreve o `payload` inteiro: o app já espelha a denúncia nas
        // colunas de topo (toLocalPet lê `reported`/`reporterDeviceId` delas),
        // e reenviar o payload local corromperia o conteúdo (ex.: `images`
        // viraria URI local em vez de URL remota) e quebraria o `WITH CHECK`
        // de RLS que compara o payload. O servidor mantém seu payload intacto.
        const { error } = await sb
          .from('pets')
          .update({
            reported: !!pet.reported,
            reporter_device_id: deviceId,
            updated_at: now,
          })
          .eq('id', pet.id);
        if (error) {
          console.warn('[sync] report update falhou:', error.message);
          failedIds.add(pet.id);
        } else {
          pet.dirty = false;
          pet.updatedAt = now;
        }
      } catch (e) {
        console.warn('[sync] erro no report update:', e);
        failedIds.add(pet.id);
      }
      continue;
    }

    let remoteUrls = pet.remoteImageUrls ?? [];
    try {
      remoteUrls = await uploadPetPhotos(pet.images, deviceId, remoteUrls);
    } catch (e) {
      console.warn('[sync] upload de fotos falhou (seguindo sem fotos):', e);
    }
    try {
      const now = new Date().toISOString();
      const payload: PetRecord = {
        ...pet,
        remoteImageUrls: remoteUrls,
        dirty: false,
        updatedAt: now,
      };
      // PII (telefone) NÃO vai no payload público de `pets` — vai para
      // `pet_contacts` (RLS restrita a dono/reporter). Finders revelam via
      // Edge Function. O registro local (PetRecord) continua com `contact`.
      const remotePayload: Record<string, unknown> = { ...payload };
      delete (remotePayload as Record<string, unknown>).contact;
      delete (remotePayload as Record<string, unknown>).ownerPhone;
      const { error } = await sb.from('pets').upsert(
        {
          id: pet.id,
          payload: remotePayload,
          owner_device_id: pet.ownerDeviceId ?? null,
          reporter_device_id: pet.reporterDeviceId ?? null,
          reported: !!pet.reported,
          updated_at: now,
          deleted_at: pet.deletedAt ?? null,
        },
        { onConflict: 'id' }
      );
      // Espelha o contato em pet_contacts (ou remove, se vazio).
      if (pet.contact) {
        const { error: cErr } = await sb
          .from('pet_contacts')
          .upsert({ pet_id: pet.id, contact: pet.contact }, { onConflict: 'pet_id' });
        if (cErr) console.warn('[sync] pet_contacts upsert falhou:', cErr.message);
      } else {
        const { error: cErr } = await sb.from('pet_contacts').delete().eq('pet_id', pet.id);
        if (cErr) console.warn('[sync] pet_contacts delete falhou:', cErr.message);
      }
      if (error) {
        console.warn('[sync] upsert falhou:', error.message);
        failedIds.add(pet.id);
      } else {
        pet.remoteImageUrls = remoteUrls;
        pet.dirty = false;
        pet.updatedAt = now;
        // Gera/atualiza o embedding para a busca semântica (IA). Fire-and-forget:
        // não deve bloquear o push — se falhar, o pet simplesmente não aparece
        // na busca por IA até o próximo backfill.
        embedPet(pet.id).catch(() => {});
      }
    } catch (e) {
      console.warn('[sync] erro no push:', e);
      failedIds.add(pet.id);
    }
  }

  // 2) Push das exclusões pendentes (soft delete)
  const pending = await getPendingDeletes();
  if (pending.length > 0) {
    try {
      const { error } = await sb.from('pets').update({ deleted_at: new Date().toISOString() }).in('id', pending);
      if (!error) await clearPendingDeletes();
      else {
        console.warn('[sync] delete pendente falhou:', error.message);
        // Se o erro é de RLS (ex.: delete pendente de pet que não é deste
        // device, ou já apagado por moderação), não adianta tentar de novo —
        // limpa para parar de warning em loop.
        if (/row-level security/i.test(error.message)) await clearPendingDeletes();
      }
    } catch (e) {
      console.warn('[sync] erro no delete pendente:', e);
    }
  }

  // 3) Pull INCREMENTAL: só o delta desde lastSync (dois filtros .gt() simples)
  const lastSync = await getLastSync();
  // Pull completo (bootstrap): na 1ª sincronização da sessão, quando o local
  // está vazio, ou quando forçado. O incremental (delta) só puxa o que mudou
  // desde `lastSync` e NUNCA recupera pets que sumiram do local com
  // updated_at <= lastSync — por isso o bootstrap precisa ser full.
  const doFull = options?.full === true || !lastSync || localPets.length === 0;
  const remoteMap: Record<string, PetRecord> = {};
  const remoteDeletedIds = new Set<string>();
  let pullOk = false;
  let maxTs = '';
  try {
    let rows: any[] = [];
    if (doFull) {
      const { data, error } = await sb.from('pets').select('*').is('deleted_at', null);
      if (error) console.warn('[sync] pull falhou:', error.message);
      rows = data ?? [];
    } else {
      const [rU, rD] = await Promise.all([
        sb.from('pets').select('*').gt('updated_at', lastSync),
        sb.from('pets').select('*').gt('deleted_at', lastSync),
      ]);
      if (rU.error) console.warn('[sync] pull updated falhou:', rU.error.message);
      if (rD.error) console.warn('[sync] pull deleted falhou:', rD.error.message);
      rows = [...(rU.data ?? []), ...(rD.data ?? [])];
    }
    for (const row of rows) {
      const u = row.updated_at ?? '';
      const d = row.deleted_at ?? '';
      if (u > maxTs) maxTs = u;
      if (d > maxTs) maxTs = d;
      if (row.deleted_at) {
        remoteDeletedIds.add(row.id);
        continue;
      }
      const pet = toLocalPet(row);
      remoteMap[pet.id] = pet;
    }
    pullOk = true;
    // Re-anexa o contato (PII) apenas para pets que este device é dono/reporter,
    // lendo de pet_contacts (RLS restrita). Finders obtêm o contato via Edge
    // Function (lib/contacts.ts) no momento do clique.
    const myPets = Object.values(remoteMap).filter(
      (p) => p.ownerDeviceId === deviceId || p.reporterDeviceId === deviceId
    );
    if (myPets.length > 0) {
      const { data: contacts } = await sb
        .from('pet_contacts')
        .select('pet_id, contact')
        .in('pet_id', myPets.map((p) => p.id));
      for (const c of contacts ?? []) {
        const pet = remoteMap[c.pet_id];
        if (pet) pet.contact = c.contact;
      }
    }
  } catch (e) {
    console.warn('[sync] erro no pull:', e);
  }

  // Reconciliação automática (full pull): remove da tela pets locais que não
  // existem mais no servidor. Só no FULL pull (que cataloga TODOS os pets não
  // deletados) e quando o pull deu certo (pullOk). NÃO remove pets com mudança
  // local pendente (dirty) nem os que falharam no push (failedIds) — esses
  // ainda não chegaram ao servidor e precisam ser preservados para o push.
  const reconcileEnabled = doFull && pullOk;

  // 4) Merge
  // No modo incremental (delta), `remoteMap` só traz as LINHAS QUE MUDARAM
  // desde `lastSync` — NÃO o catálogo completo. Por isso um pet local já
  // sincronizado (dirty=false) e ausente do delta NÃO deve ser descartado:
  // ausência no delta significa "sem alteração remota", então mantemos o
  // estado local. Só cedemos à versão remota quando ela de fato existe no
  // delta (foi alterada), e só removemos quando o remoto está soft-deletado.
  const merged: PetRecord[] = [];
  const seen = new Set<string>();
  for (const pet of working) {
    if (failedIds.has(pet.id)) {
      merged.push(pet);
      seen.add(pet.id);
      continue;
    }
    if (remoteDeletedIds.has(pet.id)) {
      seen.add(pet.id); // removido remotamente -> some do local
      continue;
    }
    // Pet local "órfão": não existe no servidor e não tem mudança pendente ->
    // removido para espelhar o estado do servidor (evita ghosts na tela sem
    // precisar de reset manual de dados).
    if (reconcileEnabled && !remoteMap[pet.id] && !pet.dirty) {
      console.log('[sync] removendo pet local órfão (não existe no servidor):', pet.id);
      seen.add(pet.id);
      continue;
    }
    const remote = remoteMap[pet.id];
    if (remote && !pet.dirty) {
      merged.push(remote); // versão remota (mais nova) prevalece, salvo se há mudança local pendente
    } else {
      merged.push(pet); // mantém local (inclui denúncia/report pendente) ou sem alteração remota
    }
    seen.add(pet.id);
  }
  for (const id of Object.keys(remoteMap)) {
    if (!seen.has(id)) merged.push(remoteMap[id]);
  }

  try {
    await onPersist(merged);
  } catch (e) {
    console.warn('[sync] falha ao persistir:', e);
  }

  // 5) Avança o cursor com o máximo updated_at/deleted_at do servidor (evita skew de relógio)
  if (pullOk && maxTs) await setLastSync(maxTs);

  return merged;
};

export { isSupabaseConfigured };
