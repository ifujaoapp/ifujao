import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Sponsor, SponsorInput } from "./types";
import SponsorMap from "./SponsorMap";

const DEFAULT_CENTER = { lat: -23.5015, lng: -47.4582 }; // Sorocaba

// Comprime/redimensiona o logo no navegador (Canvas) antes do upload, para
// economizar Storage: limita o maior lado a `maxSide` px e exporta WebP
// (menor e com transparência) com fallback para JPEG.
const compressImage = (
  file: File,
  maxSide = 256,
  quality = 0.8,
): Promise<File> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Falha ao ler a imagem."));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível."));
        ctx.drawImage(img, 0, 0, w, h);
        const finish = (type: string) =>
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error("Falha ao comprimir."));
              const ext = type === "image/webp" ? "webp" : "jpg";
              const base = file.name.replace(/\.[^.]+$/, "") || "logo";
              resolve(new File([blob], base + "." + ext, { type }));
            },
            type,
            quality,
          );
        canvas.toBlob((b) => {
          if (b && b.size > 0) finish("image/webp");
          else finish("image/jpeg");
        }, "image/webp", quality);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

function emptyForm(): SponsorInput {
  return {
    name: "",
    latitude: DEFAULT_CENTER.lat,
    longitude: DEFAULT_CENTER.lng,
    address: "",
    link: "",
    phone: "",
    instagram: "",
    facebook: "",
    logo: "",
    active: true,
    visibleFrom: "",
  };
}

export default function Admin({ onLogout }: { onLogout: () => void }) {
  const [list, setList] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState<SponsorInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; id: string } | null>(null);
  const [page, setPage] = useState(1);
  const isTouchDevice =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  const load = useCallback(async () => {
    setLoading(true);
    // Colunas explícitas (NÃO usar "*"): o cache de schema do PostgREST do
    // projeto está travado com uma coluna fantasma "visibleFrom", e o "*"
    // expande pra ela e quebra a consulta. Listar as colunas reais evita o
    // cache podre.
    const { data, error } = await supabase
      .from("sponsors")
      .select(
        "id, name, latitude, longitude, address, link, phone, instagram, facebook, logo, active, visible_from, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setList((data as Sponsor[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setLogoFile(null);
    setLogoPreview(null);
    setError("");
  };

  const startEdit = (s: Sponsor) => {
    setEditing(s);
    setForm({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      address: s.address ?? "",
      link: s.link ?? "",
      phone: s.phone ?? "",
      instagram: s.instagram ?? "",
      facebook: s.facebook ?? "",
      logo: s.logo ?? "",
      active: s.active,
      visibleFrom: s.visible_from ?? "",
    });
    setLogoFile(null);
    setLogoPreview(null);
    setError("");
  };

  const onPick = (lat: number, lng: number) => {
    setForm((f) => ({ ...f, latitude: lat, longitude: lng }));
  };

  const markMyLocation = () => {
    if (!isTouchDevice) {
      setError(
        "No computador o GPS vem errado. Clique no mapa ou digite o endereço/coordenadas manualmente.",
      );
      return;
    }
    if (!("geolocation" in navigator)) {
      setError(
        "Geolocalização indisponível. Digite Lat/Lng manualmente.",
      );
      return;
    }
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => onPick(pos.coords.latitude, pos.coords.longitude),
      (err) =>
        setError(
          `GPS falhou (${err.message}). Clique no mapa ou digite Lat/Lng manualmente.`,
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const buildQueryCandidates = (raw: string): string[] => {
    const q = (raw ?? "").trim();
    if (!q) return [];
    const noCep = q
      .replace(/\s*\d{5}-?\d{3}\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const noBairro = noCep
      .replace(/\s-\s*[^,]+,/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
    const streetNum = parts[0] ?? "";
    const cityPart =
      parts.find((p) => /(sorocaba|votorantim|s[aâ]o paulo|\bsp\b)/i.test(p)) ?? "";
    const simplified = [streetNum, cityPart].filter(Boolean).join(", ");
    return Array.from(new Set([q, noCep, noBairro, simplified].filter(Boolean)));
  };

  const geocodeOnce = async (
    query: string,
  ): Promise<{ lat: number; lng: number } | null> => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        query,
      )}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
      }
    } catch {
      /* tenta próxima variante */
    }
    return null;
  };

  const geocodeAddress = async (raw: string) => {
    const candidates = buildQueryCandidates(raw);
    if (candidates.length === 0) return;
    setError("");
    let found: { lat: number; lng: number } | null = null;
    for (const c of candidates) {
      found = await geocodeOnce(c);
      if (found) break;
    }
    if (found) {
      onPick(found.lat, found.lng);
    } else {
      setError("Endereço não encontrado. Tente rua, número e cidade.");
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Informe o nome do patrocinador.");
      return;
    }
    setSaving(true);
    setError("");
    let logoUrl = form.logo?.trim() || null;
    if (logoFile) {
      const ext = (logoFile.name.split(".").pop() || "png").toLowerCase();
      const path = (editing?.id || crypto.randomUUID()) + "." + ext;
      const { error: upErr } = await supabase.storage
        .from("sponsor-logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (upErr) {
        setError(upErr.message);
        setSaving(false);
        return;
      }
      logoUrl = supabase.storage.from("sponsor-logos").getPublicUrl(path).data
        .publicUrl;
    }
    // Não usar `...form`: o form tem o campo `visibleFrom` (camelCase da UI)
    // que NÃO existe no banco e quebra a query (o PostgREST reclama da
    // coluna fantasma). Listar só as colunas reais.
    const payload = {
      name: form.name,
      latitude: form.latitude,
      longitude: form.longitude,
      address: form.address?.trim() || null,
      link: form.link?.trim() || null,
      phone: form.phone?.trim() || null,
      instagram: form.instagram?.trim() || null,
      facebook: form.facebook?.trim() || null,
      logo: logoUrl,
      active: form.active,
      visible_from: form.visibleFrom ? form.visibleFrom : null,
    };
    let result;
    if (editing) {
      result = await supabase.from("sponsors").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("sponsors").insert(payload);
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEditing(null);
    setForm(emptyForm());
    setLogoFile(null);
    setLogoPreview(null);
    load();
    showToast(editing ? "Patrocinador atualizado!" : "Patrocinador adicionado!");
  };

  const remove = async (s: Sponsor) => {
    if (!window.confirm(`Excluir "${s.name}"?`)) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", s.id);
    if (error) {
      setError(error.message);
      return;
    }
    load();
    showToast("Patrocinador excluído.");
  };

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const focusSponsor = (s: Sponsor) => {
    setFocus({ lat: s.latitude, lng: s.longitude, id: s.id });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const visible = list.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const perPage = 10;
  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const paged = visible.slice((page - 1) * perPage, page * perPage);
  const total = list.length;
  const ativos = list.filter((s) => s.active).length;
  const inativos = total - ativos;

  return (
    <div className="admin-wrap">
        <header style={header}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            🛍️ Patrocinadores
          </h2>
          <button style={logoutBtn} onClick={logout}>
            Sair
          </button>
        </header>

      <div className="admin-content">
        <section style={panel} className="area-map">
          <SponsorMap
            lat={form.latitude}
            lng={form.longitude}
            onPick={onPick}
            sponsors={list}
            currentId={editing?.id ?? null}
            focus={focus}
          />
          <button style={locBtn} onClick={markMyLocation} type="button">
            📍 Usar minha localização (GPS)
          </button>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
            Posição atual — Lat: {form.latitude.toFixed(5)} / Lng:{" "}
            {form.longitude.toFixed(5)}
          </p>
        </section>

        <section style={formPanel} className="area-form">
            <h3 style={{ marginTop: 0 }}>
              {editing ? `Editando: ${editing.name}` : "Novo patrocinador"}
            </h3>
            <div style={formScroll}>
            <input
              style={input}
              placeholder="Nome *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          <input
            style={input}
            placeholder="Endereço ou CEP (Enter para marcar no mapa)"
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                geocodeAddress(form.address ?? "");
              }
            }}
          />
          <button
            type="button"
            className="disclosure"
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? "▾ Coordenadas avançadas" : "▸ Coordenadas avançadas"}
          </button>
          {advanced ? (
            <input
              style={input}
              placeholder="Latitude, longitude  (ex.: -23.505396644879013, -47.42821991461613)"
              onChange={(e) => {
                const partes = e.target.value
                  .split(",")
                  .map((s) => parseFloat(s.trim()));
                if (
                  partes.length === 2 &&
                  !Number.isNaN(partes[0]) &&
                  !Number.isNaN(partes[1])
                ) {
                  setForm({ ...form, latitude: partes[0], longitude: partes[1] });
                }
              }}
            />
          ) : null}
          <div className="form-grid-2">
            <input
              style={input}
              placeholder="Link (opcional, ex.: site/Instagram)"
              value={form.link ?? ""}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
            <input
              style={input}
              placeholder="Telefone (opcional)"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <input
              style={input}
              placeholder="Instagram (opcional, ex.: @loja)"
              value={form.instagram ?? ""}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
            <input
              style={input}
              placeholder="Facebook (opcional, URL da página)"
              value={form.facebook ?? ""}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
            />
          </div>
          <label style={fieldLabel}>Logo (opcional, arquivo de imagem)</label>
          <input
            style={input}
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f =
                e.target.files && e.target.files[0] ? e.target.files[0] : null;
              if (!f) {
                setLogoFile(null);
                setLogoPreview(null);
                return;
              }
              try {
                const comp = await compressImage(f);
                setLogoFile(comp);
                setLogoPreview(URL.createObjectURL(comp));
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
          {logoPreview ? (
            <img src={logoPreview} alt="Prévia do logo" style={logoPreviewStyle} />
          ) : form.logo ? (
            <img src={form.logo} alt="Logo atual" style={logoPreviewStyle} />
          ) : null}
          <label style={fieldLabel}>Data de exibição (opcional)</label>
          <input
            style={input}
            type="date"
            value={form.visibleFrom ?? ""}
            onChange={(e) => setForm({ ...form, visibleFrom: e.target.value })}
          />
          <p style={{ fontSize: 12, color: "#666", marginTop: -4, marginBottom: 12 }}>
            Deixe em branco para nunca expirar. O pin aparece hoje e fica visível até esta data.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Ativo (visível no app)
          </label>
          {error ? <p style={err}>{error}</p> : null}
          </div>
          <div style={formFooter}>
            <button style={btnPrimary} disabled={saving} onClick={save}>
              {saving ? (
                <>
                  <span className="spinner" /> Salvando…
                </>
              ) : editing ? (
                "Atualizar"
              ) : (
                "Adicionar"
              )}
            </button>
            <button type="button" style={btnText} onClick={startNew}>
              {editing ? "Cancelar" : "Limpar"}
            </button>
          </div>
        </section>

        <section style={panel} className="area-list">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 0,
            }}
          >
            <h3 style={{ margin: 0 }}>Cadastrados ({visible.length})</h3>
            <div style={{ display: "flex", gap: 6 }}>
              <span className="stat-badge stat-badge-total">{total}</span>
              <span className="stat-badge stat-badge-active">
                {ativos} ativos
              </span>
              <span className="stat-badge stat-badge-inactive">
                {inativos} inativos
              </span>
            </div>
          </div>
          <input
            style={input}
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {loading ? <p>Carregando…</p> : null}
          <ul style={listUl}>
            {paged.map((s) => (
              <li
                key={s.id}
                style={{ ...item, cursor: "pointer" }}
                onClick={() => focusSponsor(s)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {s.logo ? (
                    <img src={s.logo} alt="" style={listThumb} />
                  ) : (
                    <div style={listThumbEmpty}>🛍️</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <strong
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.name}
                      </strong>
                      {!s.active ? <span style={badge}>inativo</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {s.address ||
                        `${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}`}
                      {s.visible_from ? ` · exibe até ${s.visible_from}` : ""}
                    </div>
                  </div>
                </div>
                <div
                  style={{ display: "flex", gap: 6 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="btn-edit" onClick={() => startEdit(s)}>
                    Editar
                  </button>
                  <button className="btn-danger" onClick={() => remove(s)}>
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
              gap: 8,
            }}
          >
            <button
              className="btn-edit"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: 13, color: "#666" }}>
              Página {page} de {totalPages}
            </span>
            <button
              className="btn-edit"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima →
            </button>
          </div>
        </section>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  background: "#fff",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};
const logoutBtn: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  fontSize: 14,
};
const panel: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
};
const formPanel: React.CSSProperties = {
  ...panel,
};
const formScroll: React.CSSProperties = {};
const input: React.CSSProperties = {
  width: "100%",
  padding: 10,
  marginBottom: 8,
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 15,
};
const fieldLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#1c1c1e",
};
const logoPreviewStyle: React.CSSProperties = {
  width: 96,
  height: 96,
  objectFit: "cover",
  borderRadius: 12,
  marginTop: 8,
  border: "1px solid #e5e5ea",
};
const locBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  borderRadius: 10,
  border: "1px solid #FF9500",
  background: "#fff",
  color: "#FF9500",
  fontSize: 14,
  fontWeight: 600,
};
const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: 12,
  borderRadius: 10,
  border: "none",
  background: "#0A84FF",
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
};
const btnText: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0A84FF",
  padding: "12px 8px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const listUl: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  flex: 1,
  minHeight: 0,
  maxHeight: 480,
  overflowY: "auto",
};
const listThumb: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  objectFit: "cover",
  border: "1px solid #e5e5ea",
  flex: "0 0 auto",
};
const listThumbEmpty: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: "1px solid #e5e5ea",
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  background: "#fff7ec",
};
const err: React.CSSProperties = { color: "#FF3B30", fontSize: 13 };
const formFooter: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid #e5e5ea",
};
const item: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 0",
  borderBottom: "1px solid #f0f0f3",
};
const badge: React.CSSProperties = {
  fontSize: 11,
  color: "#FF9500",
  border: "1px solid #FF9500",
  borderRadius: 6,
  padding: "1px 6px",
  marginLeft: 6,
};
