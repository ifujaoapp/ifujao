import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onLoggedIn();
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>iFujão — Admin</h2>
        <p style={{ color: "#666", marginTop: 0 }}>
          Acesso restrito a patrocinadores.
        </p>
        <input
          style={input}
          placeholder="E-mail"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={input}
          placeholder="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p style={err}>{error}</p> : null}
        <button style={btn} disabled={loading} onClick={signIn}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  width: 340,
  maxWidth: "100%",
  boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginBottom: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 15,
};
const btn: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "none",
  background: "#0A84FF",
  color: "#fff",
  fontSize: 16,
  fontWeight: 600,
};
const err: React.CSSProperties = { color: "#FF3B30", fontSize: 13 };
