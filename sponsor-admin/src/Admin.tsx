import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import type { Sponsor, SponsorInput } from "./types";
import SponsorMap from "./SponsorMap";

const DEFAULT_CENTER = { lat: -23.5015, lng: -47.4582 }; // Sorocaba

function emptyForm(): SponsorInput {
  return {
    name: "",
    latitude: DEFAULT_CENTER.lat,
    longitude: DEFAULT_CENTER.lng,
    address: "",
    link: "",
    active: true,
  };
}

export default function Admin({ onLogout }: { onLogout: () => void }) {
  const [list, setList] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState<SponsorInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sponsors")
      .select("*")
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
      active: s.active,
    });
    setError("");
  };

  const onPick = (lat: number, lng: number) => {
    setForm((f) => ({ ...f, latitude: lat, longitude: lng }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError("Informe o nome do patrocinador.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      ...form,
      address: form.address?.trim() || null,
      link: form.link?.trim() || null,
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
    load();
  };

  const remove = async (s: Sponsor) => {
    if (!window.confirm(`Excluir "${s.name}"?`)) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", s.id);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  return (
    <div style={wrap}>
      <header style={header}>
        <h2 style={{ margin: 0 }}>Patrocinadores</h2>
        <button style={logoutBtn} onClick={logout}>
          Sair
        </button>
      </header>

      <div style={content}>
        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>
            {editing ? `Editando: ${editing.name}` : "Novo patrocinador"}
          </h3>
          <input
            style={input}
            placeholder="Nome *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <SponsorMap
            lat={form.latitude}
            lng={form.longitude}
            onPick={onPick}
          />
          <p style={{ fontSize: 13, color: "#666" }}>
            Clique no mapa para definir a localização. Lat: {form.latitude.toFixed(5)}{" "}
            / Lng: {form.longitude.toFixed(5)}
          </p>
          <input
            style={input}
            placeholder="Endereço (opcional, texto legível)"
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <input
            style={input}
            placeholder="Link (opcional, ex.: site/Instagram)"
            value={form.link ?? ""}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Ativo (visível no app)
          </label>
          {error ? <p style={err}>{error}</p> : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimary} disabled={saving} onClick={save}>
              {saving ? "Salvando…" : editing ? "Atualizar" : "Adicionar"}
            </button>
            <button style={btnGhost} onClick={startNew}>
              Limpar
            </button>
          </div>
        </section>

        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>Cadastrados ({list.length})</h3>
          {loading ? <p>Carregando…</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {list.map((s) => (
              <li key={s.id} style={item}>
                <div>
                  <strong>{s.name}</strong>{" "}
                  {!s.active ? <span style={badge}>inativo</span> : null}
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {s.address || `${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={btnSmall} onClick={() => startEdit(s)}>
                    Editar
                  </button>
                  <button style={btnSmallDanger} onClick={() => remove(s)}>
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", paddingBottom: 40 };
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "16px 20px",
  background: "#fff",
  borderBottom: "1px solid #e5e5ea",
};
const logoutBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
};
const content: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
  gap: 16,
  padding: 16,
  maxWidth: 1100,
  margin: "0 auto",
};
const panel: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 15,
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
const btnGhost: React.CSSProperties = {
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
};
const btnSmall: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  fontSize: 13,
};
const btnSmallDanger: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #FF3B30",
  color: "#FF3B30",
  background: "#fff",
  fontSize: 13,
};
const err: React.CSSProperties = { color: "#FF3B30", fontSize: 13 };
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
