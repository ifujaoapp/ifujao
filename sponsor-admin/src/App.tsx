import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import Admin from "./Admin";

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(Boolean(s));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === null) return <div style={{ padding: 24 }}>Carregando…</div>;
  if (!session) return <Login onLoggedIn={() => setSession(true)} />;
  return <Admin onLogout={() => setSession(false)} />;
}
