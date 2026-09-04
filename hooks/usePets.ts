import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Share } from "react-native";
import { ssGet } from "@/lib/secureStoreSafe";
import { showAlert } from "@/src/components/AppAlert";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { isOwner, normalizePhone } from "@/constants/breeds";
import { addPendingDelete, fetchPetRemote, isSupabaseConfigured, runSync } from "@/lib/sync";
import { deletePetPhotos } from "@/lib/photos";
import {
  loginModerator as libLoginModerator,
  logoutModerator as libLogoutModerator,
  moderatorSoftDelete,
} from "@/lib/moderation";
import { onDeepLinkPet, consumePendingPetId } from "@/lib/deeplink";
import { clearPhotos, loadPets, savePets, type PetRecord } from "@/lib/storage";
import { fetchSponsors, fetchSponsorsDelta, isSponsorVisible, type SponsorPin } from "@/lib/sponsors";
import { requestNotificationPermission, notifyMatchRequest } from "@/lib/notify";

type PetPost = PetRecord;

export function usePets() {
  const [pets, setPets] = useState<PetPost[]>([]);
  const [sponsors, setSponsors] = useState<SponsorPin[]>([]);
  const [myPhone, setMyPhone] = useState("");
  const [myDeviceId, setMyDeviceId] = useState("");
  const petsRef = useRef<PetPost[]>([]);
  const initialSyncDone = useRef(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const triggerSyncRef = useRef<() => void>(() => {});
  const lastSponsorSyncRef = useRef<string | null>(null);
  // Ids de matches pendentes já notificados (evita notificar de novo a cada sync).
  const seenPendingRef = useRef<Set<string>>(new Set());
  const [selectedPet, setSelectedPet] = useState<PetPost | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<PetPost | null>(null);
  const [sponsorInfo, setSponsorInfo] = useState<SponsorPin | null>(null);
  const shareCardRef = useRef<any>(null);

  // Modo deus (moderação): habilita editar/apagar pets de outros usuários.
  // Inicializa lendo o token do storage (caso o usuario ja estivesse logado
  // em uma sessao anterior). Tambem re-checa no AppState 'active' para o
  // caso do token ter sido setado em outra tela ou apos o hook montar.
  const [godMode, setGodMode] = useState(false);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const t = await ssGet("ifujao_god_token");
        if (mounted) setGodMode(!!t);
      } catch (e) {
        console.warn("[usePets] godMode refresh erro:", e);
      }
    };
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Solicita permissão de notificação (barra do sistema) uma vez no boot.
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const commitPets = useCallback(
    async (next: PetPost[]) => {
      setPets(next);
      petsRef.current = next;
      try {
        const prevUris = new Set(pets.flatMap((p) => p.images));
        const nextUris = new Set(next.flatMap((p) => p.images));
        const orphans = [...prevUris].filter((u) => !nextUris.has(u));
        if (orphans.length > 0) await clearPhotos(orphans);
        await savePets(next as PetRecord[]);
      } catch (e) {
        console.warn("[usePets] erro:", e);
      }
      triggerSyncRef.current();
    },
    [pets],
  );

  const triggerSync = useCallback(
    async (full = false) => {
      if (!isSupabaseConfigured) {
        console.warn(
          "[index] SYNC IGNORADO: Supabase não configurado (EXPO_PUBLIC_SUPABASE_* ausentes no bundle).",
        );
        return;
      }
      let deviceId = myDeviceId;
      if (!deviceId) {
        try {
          deviceId = await getOrCreateDeviceId();
          if (deviceId) setMyDeviceId(deviceId);
        } catch (e) {
        console.warn("[usePets] erro:", e);
      }
      }
      if (!deviceId) {
        console.warn("[index] SYNC IGNORADO: myDeviceId ainda vazio.");
        return;
      }
      try {
        const synced = await runSync(
          petsRef.current,
          deviceId,
          async (p) => {
            petsRef.current = p;
            setPets(p);
            await savePets(p as PetRecord[]);
          },
          { full },
        );
        petsRef.current = synced;
        setPets(synced);
        // Notifica (barra do celular) quando surge um NOVO match pendente do qual
        // este device é o lado que deve confirmar (não quem iniciou). Só dispara
        // com app aberto/segundo plano; app fechado fica sem aviso (sem FCM).
        for (const p of synced) {
          const isResponder =
            (p.postType === 'lost' && p.matchRequestedBy === 'finder') ||
            (p.postType === 'found' && p.matchRequestedBy === 'owner');
          if (
            p.matchStatus === 'pending' &&
            isResponder &&
            isOwner(p, deviceId, myPhone) &&
            !seenPendingRef.current.has(p.id)
          ) {
            notifyMatchRequest(p, p.postType === 'found');
          }
        }
        seenPendingRef.current = new Set(
          synced
            .filter((p) => p.matchStatus === 'pending' && isOwner(p, deviceId, myPhone))
            .map((p) => p.id),
        );
        console.log(
          "[index] SYNC concluído -> pets no estado:",
          synced.length,
          synced.map((p) => p.id),
        );
      } catch (e) {
        console.warn("[index] sync erro:", e);
      }
    },
    [myDeviceId, myPhone],
  );

  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  }, [triggerSync]);

  // Refresh de patrocinadores com delta: no primeiro pull (ou quando o
  // cursor está vazio) traz a lista completa; depois só o que mudou desde
  // `lastSponsorSyncRef` (updated_at) + a lista de ids ativos para remover
  // pins apagados/desativados no backend.
  const refreshSponsors = useCallback(async () => {
    const now = new Date().toISOString();
    try {
      if (!lastSponsorSyncRef.current) {
        const list = await fetchSponsors();
        setSponsors(list);
      } else {
        const { changed, activeIds } = await fetchSponsorsDelta(
          lastSponsorSyncRef.current,
        );
        if (activeIds === null) return; // sem backend/erro: mantém cache atual
        setSponsors((prev) => {
          const byId = new Map(prev.map((s) => [s.id, s]));
          for (const c of changed) byId.set(c.id, c);
          return [...byId.values()].filter(
            (s) => activeIds.includes(s.id) && isSponsorVisible(s),
          );
        });
      }
      lastSponsorSyncRef.current = now;
    } catch (e) {
      console.warn("[usePets] erro:", e);
    }
  }, []);

  useEffect(() => {
    if (myDeviceId && localLoaded && !initialSyncDone.current) {
      initialSyncDone.current = true;
      triggerSync(true); // pull completo no boot (recupera pets que sumiram do local)
    }
  }, [myDeviceId, localLoaded, triggerSync]);

  const openPetFromDeepLink = useCallback(async (pid: string) => {
    const local = petsRef.current.find((p) => p.id === pid);
    const pet = local ?? (await fetchPetRemote(pid));
    if (pet) setSelectedPet(pet);
  }, []);

  useEffect(() => {
    const unsub = onDeepLinkPet((pid) => {
      openPetFromDeepLink(pid);
    });
    const pending = consumePendingPetId();
    if (pending) openPetFromDeepLink(pending);
    return unsub;
  }, [openPetFromDeepLink]);

  const handleSponsorPress = (s: SponsorPin) => {
    setSponsorInfo(s);
  };

  const sharePetCard = async (pet: PetPost) => {
    const link = `https://ifujaoapp.github.io/ifujao-links/pet/?id=${pet.id}`;
    const place = `${pet.location || "Sorocaba"}${pet.city ? ` — ${pet.city}` : ""}`;
    const message = `🐾 Ajude a encontrar este pet perdido em ${place}!\n${link}`;
    try {
      await Share.share({ message });
    } catch {
      showAlert("error", "Erro", "Não foi possível compartilhar.");
    }
  };

  const onMarkerPress = useCallback(async (petId: string) => {
    const pet = petsRef.current.find((p) => p.id === petId);
    if (pet) setSelectedPet(pet);
    const remote = await fetchPetRemote(petId);
    if (remote) {
      // Preserva o estado de denúncia local caso o servidor ainda
      // não tenha propagado o relatório (evita perder a bandeira
      // DENÚNCIA e a opção "Apagar denúncia" ao reabrir o card).
      const merged =
        pet && pet.reported && !remote.reported
          ? {
              ...remote,
              reported: pet.reported,
              reportReason: pet.reportReason,
              reportedBy: pet.reportedBy,
              reporterDeviceId: pet.reporterDeviceId,
            }
          : remote;
      setPets((prev) => {
        const exists = prev.some((p) => p.id === petId);
        return exists
          ? prev.map((p) => (p.id === petId ? merged : p))
          : [merged, ...prev];
      });
      setSelectedPet(
        (cur) => (cur && cur.id === petId ? merged : cur) ?? merged,
      );
    }
  }, []);

  const reportPet = (pet: PetPost) => {
    // O dono não denuncia o próprio post (evita erro de RLS e confusão de UX).
    if (isOwner(pet, myDeviceId, myPhone)) return;
    setReportTarget(pet);
  };

  const submitReport = (pet: PetPost, reason: string) => {
    // O dono não denuncia o próprio post.
    if (isOwner(pet, myDeviceId, myPhone)) return;
    const reporter = myPhone ? normalizePhone(myPhone) : "";
    commitPets(
      pets.map((p) =>
        p.id === pet.id
          ? {
              ...p,
              reported: true,
              reportReason: reason,
              reportedBy: reporter,
              reporterDeviceId: myDeviceId,
              dirty: true,
            }
          : p,
      ),
    );
    setReportTarget(null);
    setSelectedPet(null);
    showAlert(
      "info",
      "Denúncia enviada",
      "Obrigado. Nossa equipe irá analisar este alerta.",
    );
  };

  const deletePet = (petId: string, skipConfirm = false) => {
    const doDelete = async () => {
      const pet = pets.find((p) => p.id === petId);
      const next = pets.filter((p) => p.id !== petId);
      if (godMode) {
        const ok = await moderatorSoftDelete(petId);
        if (!ok) {
          showAlert("error", "Erro", "Não foi possível remover o post no servidor.");
        } else {
          commitPets(next);
          triggerSync(true);
        }
      } else {
        await addPendingDelete(petId);
        commitPets(next);
        if (
          pet &&
          isSupabaseConfigured &&
          isOwner(pet, myDeviceId, myPhone)
        ) {
          const urls = pet.remoteImageUrls ?? [];
          if (urls.length > 0) {
            deletePetPhotos(urls, myDeviceId).catch((e) => {
              console.warn("[index] delete fotos:", e);
            });
          }
        }
      }
      setSelectedPet(null);
    };

    if (skipConfirm) {
      void doDelete();
      return;
    }

    showAlert(
      "trash",
      "Apagar alerta",
      godMode
        ? "Modo deus: isto removerá o post de outro usuário do servidor. Confirmar?"
        : "Tem certeza que deseja apagar este alerta? Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: doDelete,
        },
      ],
    );
  };

  const loginModerator = async (username: string, password: string) => {
    const ok = await libLoginModerator(username, password);
    if (ok) setGodMode(true);
    return ok;
  };

  const logoutModerator = async () => {
    await libLogoutModerator();
    setGodMode(false);
  };

  // --- bootstrap (identidade + carga local + patrocinadores) ---
  useEffect(() => {
    (async () => {
      try {
        const saved = await ssGet("ifujao_my_phone");
        if (saved) setMyPhone(saved);
      } catch (e) {
        console.warn("[usePets] erro:", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const id = await getOrCreateDeviceId();
        if (id) setMyDeviceId(id);
      } catch (e) {
        console.warn("[usePets] erro:", e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadPets();
        if (loaded.length > 0) {
          petsRef.current = loaded as PetPost[];
          setPets(loaded as PetPost[]);
        }
      } catch (e) {
        console.warn("[usePets] erro:", e);
      }
      setLocalLoaded(true);
    })();
  }, []);

  useEffect(() => {
    petsRef.current = pets;
  }, [pets]);

  useEffect(() => {
    refreshSponsors();
  }, [refreshSponsors]);

  return {
    pets,
    setPets,
    sponsors,
    myPhone,
    setMyPhone,
    myDeviceId,
    setMyDeviceId,
    selectedPet,
    setSelectedPet,
    showOnlyMine,
    setShowOnlyMine,
    showDescriptionModal,
    setShowDescriptionModal,
    reportTarget,
    setReportTarget,
    sponsorInfo,
    setSponsorInfo,
    shareCardRef,
    commitPets,
    triggerSync,
    refreshSponsors,
    openPetFromDeepLink,
    handleSponsorPress,
    sharePetCard,
    onMarkerPress,
    reportPet,
    submitReport,
    deletePet,
    godMode,
    loginModerator,
    logoutModerator,
  };
}
