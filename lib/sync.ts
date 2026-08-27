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

// Cursor SEPARADO para soft-deletes. Ver comentário no passo 3: usar um único
// cursor para updated_at e deleted_at fazia deletes "fantasma" escaparem.
const LAST_SYNC_DEL_KEY = 'ifujao_last_sync_del';

const getLastDeletedSync = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(LAST_SYNC_DEL_KEY);
  } catch {
    return null;
  }
};

const setLastDeletedSync = async (iso: string): Promise<void> => {
  await SecureStore.setItemAsync(LAST_SYNC_DEL_KEY, iso).catch(() => {});
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
    // `post_type` é a fonte autoritativa do tipo de post (espelhado no payload
    // também). Padrão 'lost' para registros legados sem a coluna.
    postType: ((row.post_type as string) ?? pet.postType ?? 'lost') as 'lost' | 'found',
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
// desde os cursores de `updated_at` e `deleted_at` (cursores INDEPENDENTES).
// Isso evita estourar o plano de tráfego mesmo com milhares de pins e garante
// que um soft-delete não "escape" por causa de uma atualização alheia.
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
        // `updated_at` fica a cargo do trigger do banco (pets_set_updated_at),
        // que usa now() do SERVIDOR — assim o cursor de sync não sofre com o
        // relógio do cliente (dispositivos com hora errada deixavam deletes/
        // pets novos passarem "atrás" do cursor e nunca serem puxados).
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
          })
          .eq('id', pet.id);
        if (error) {
          console.warn('[sync] report update falhou:', error.message);
          failedIds.add(pet.id);
        } else {
          pet.dirty = false;
          // updated_at autoritativo (servidor) vem no próximo pull; aqui só
          // marcamos localmente para não ficar vazio.
          pet.updatedAt = new Date().toISOString();
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
          deleted_at: pet.deletedAt ?? null,
          found_at: pet.foundAt ?? null,
          post_type: pet.postType ?? 'lost',
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

  // 3) Pull INCREMENTAL: só o delta desde os cursores de updated_at e deleted_at.
  // IMPORTANTE: os dois cursores são INDEPENDENTES. Se usássemos um único
  // cursor para ambos, uma atualização de OUTRO pet (ex.: alguém editando um
  // post perdido) avançaria o cursor além de um soft-delete feito logo em
  // seguida, e esse delete NUNCA seria puxado — o pin ficaria "fantasma" no
  // mapa mesmo após o dono apagar no backend. Por isso puxamos os deletes com
  // seu próprio cursor (lastDeletedSync), que só avança quando um delete é
  // efetivamente visto.
  const lastUpdatedSync = await getLastSync();
  const lastDeletedSync = await getLastDeletedSync();
  // Pull completo (bootstrap): na 1ª sincronização da sessão, quando o local
  // está vazio, ou quando forçado. O incremental (delta) só puxa o que mudou
  // desde os cursores e NUNCA recupera pets que sumiram do local — por isso o
  // bootstrap precisa ser full.
  const doFull = options?.full === true || !lastUpdatedSync || localPets.length === 0;
  const remoteMap: Record<string, PetRecord> = {};
  const remoteDeletedIds = new Set<string>();
  let pullOk = false;
  let maxUpdatedTs = '';
  let maxDeletedTs = '';
  try {
    let rows: any[] = [];
    if (doFull) {
      const { data, error } = await sb.from('pets').select('*').is('deleted_at', null);
      if (error) console.warn('[sync] pull falhou:', error.message);
      rows = data ?? [];
    } else {
      const [rU, rD] = await Promise.all([
        sb.from('pets').select('*').gt('updated_at', lastUpdatedSync),
        sb.from('pets').select('*').gt('deleted_at', lastDeletedSync),
      ]);
      if (rU.error) console.warn('[sync] pull updated falhou:', rU.error.message);
      if (rD.error) console.warn('[sync] pull deleted falhou:', rD.error.message);
      rows = [...(rU.data ?? []), ...(rD.data ?? [])];
    }
    for (const row of rows) {
      const u = row.updated_at ?? '';
      const d = row.deleted_at ?? '';
      if (u > maxUpdatedTs) maxUpdatedTs = u;
      if (d > maxDeletedTs) maxDeletedTs = d;
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
  // desde os cursores — NÃO o catálogo completo. Por isso um pet local já
  // sincronizado (dirty=false) e ausente do delta NÃO deve ser descartado:
  // ausência no delta significa "sem alteração remota", então mantemos o
  // estado local. Só cedemos à versão remota quando ela de fato existe no
  // delta (foi alterada), e só removemos quando o remoto está soft-deletado
  // (remoteDeletedIds, puxado pelo cursor de deleted_at).
  const merged: PetRecord[] = [];
  const seen = new Set<string>();
  const localIds = new Set(working.map((p) => p.id));
  // Match "órfão": o pet apontado por `matchedPetId` sumiu (deletado no
  // backend, ou — no full pull — ausente do catálogo ativo e também não é um
  // pet local ainda não enviado). Nesses casos limpamos o vínculo local para o
  // banner de "Em acordo" não contar um match fantasma cujo pin já não existe.
  const isMatchDangling = (id?: string | null): boolean => {
    if (!id) return false;
    if (remoteDeletedIds.has(id)) return true;
    if (doFull && !remoteMap[id] && !localIds.has(id)) return true;
    return false;
  };
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
    const base = remote && !pet.dirty ? remote : pet;
    if (isMatchDangling(base.matchedPetId)) {
      // Contraparte do match foi apagada: zera o vínculo para não exibir um
      // "Em acordo" fantasma no banner.
      merged.push({
        ...base,
        matchedPetId: null,
        matchStatus: null,
        matchRequestedBy: null,
      });
    } else if (remote && !pet.dirty) {
      merged.push(remote); // versão remota (mais nova) prevalece, salvo se há mudança local pendente
    } else {
      merged.push(pet); // mantém local (inclui denúncia/report pendente) ou sem alteração remota
    }
    seen.add(pet.id);
  }
  for (const id of Object.keys(remoteMap)) {
    if (!seen.has(id)) {
      const rp = remoteMap[id];
      // Também limpa vínculo de match órfão em pets que chegaram novos do backend.
      merged.push(
        isMatchDangling(rp.matchedPetId)
          ? { ...rp, matchedPetId: null, matchStatus: null, matchRequestedBy: null }
          : rp,
      );
    }
  }

  try {
    await onPersist(merged);
  } catch (e) {
    console.warn('[sync] falha ao persistir:', e);
  }

  // 5) Avança os cursores de forma INDEPENDENTE (evita skew de relógio e
  // garante que um soft-delete nunca "escape" por causa de uma atualização
  // alheia). No pull completo não recebemos deletes (só pets ativos), então
  // alinhamos o cursor de deletes com o de updates para não re-puxar deletes
  // históricos a cada sync.
  if (pullOk) {
    if (maxUpdatedTs) await setLastSync(maxUpdatedTs);
    const newDeletedTs = doFull ? maxUpdatedTs : maxDeletedTs;
    if (newDeletedTs) await setLastDeletedSync(newDeletedTs);
  }

  return merged;
};

export { isSupabaseConfigured };
