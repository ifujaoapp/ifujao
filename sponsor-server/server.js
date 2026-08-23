// Config web (HTTP, Node puro, sem dependências) para DEFINIR patrocinadores:
// formulário de criar/editar/excluir, integrado com a tabela `sponsors` do
// Supabase. Grava via service_role (a anon key é barrada pela RLS de escrita).
//
// Como rodar:
//   1) Crie o .env (veja .env.example) com SUPABASE_URL, SUPABASE_ANON_KEY e
//      SUPABASE_ANON_KEY.
//   2) node server.js  ->  abra http://localhost:5175

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnv() {
  try {
    const raw = await readFile(join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const idx = t.indexOf("=");
      if (idx === -1) continue;
      const key = t.slice(0, idx).trim();
      const val = t.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* sem .env, usa process.env */
  }
}
await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "https://waxxrmfinmiyktteylsg.supabase.co";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const PORT = Number(process.env.PORT || 5175);

async function sb(method, path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    try {
      const html = await readFile(join(__dirname, "public", "index.html"), "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Erro ao carregar a página.");
    }
    return;
  }

  // Busca o endereço (geocoding) via Nominatim, feito no servidor (CORS/UA ok)
  if (req.method === "GET" && url.pathname === "/api/geocode") {
    const q = url.searchParams.get("q");
    if (!q || !q.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Informe o endereço." }));
      return;
    }
    const raw = q.trim();
    const candidates = [raw];
    if (!/(sorocaba|votorantim|s[aâ]o paulo|\bsp\b)/i.test(raw)) candidates.push(raw + ", Sorocaba");
    candidates.push(raw + ", Sorocaba, Brasil");
    candidates.push(raw + ", São Paulo, Brasil");
    try {
      let found = null;
      for (const c of candidates) {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(c)}`,
          { headers: { "User-Agent": "iFujaoSponsor/1.0", Accept: "application/json" } },
        );
        if (!r.ok) continue;
        const d = await r.json();
        if (Array.isArray(d) && d.length) {
          found = { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon), display: d[0].display_name };
          break;
        }
      }
      if (found) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(found));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Endereço não encontrado." }));
      }
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  // Lista todos os patrocinadores (config: mostra ativos e inativos)
  if (req.method === "GET" && url.pathname === "/api/sponsors") {
    if (!ANON_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "SUPABASE_ANON_KEY não definida." }));
      return;
    }
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/sponsors?select=*&order=created_at.desc`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
      );
      const data = r.ok ? await r.json() : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if ((req.method === "POST" || req.method === "PUT") && url.pathname === "/api/sponsors") {
    if (!ANON_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "SUPABASE_ANON_KEY não configurada." }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "JSON inválido." }));
      return;
    }
    const name = String(data.name || "").trim();
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (!name) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Informe o nome do patrocinador." }));
      return;
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "latitude/longitude inválidas." }));
      return;
    }
    const payload = {
      name,
      latitude,
      longitude,
      link: data.link ? String(data.link).trim() || null : null,
      address: data.address ? String(data.address).trim() || null : null,
      active: data.active !== false,
      visible_from: data.visibleFrom
        ? new Date(data.visibleFrom + "T00:00:00").toISOString()
        : null,
    };
    try {
      const r = await sb(req.method, "sponsors", payload);
      if (!r.ok) {
        const txt = await r.text();
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Supabase retornou ${r.status}: ${txt}` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/sponsors/")) {
    if (!ANON_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "SUPABASE_ANON_KEY não configurada." }));
      return;
    }
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    let body = "";
    for await (const chunk of req) body += chunk;
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "JSON inválido." }));
      return;
    }
    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "latitude/longitude inválidas." }));
      return;
    }
    const payload = {
      name: String(data.name || "").trim(),
      latitude,
      longitude,
      link: data.link ? String(data.link).trim() || null : null,
      address: data.address ? String(data.address).trim() || null : null,
      active: data.active !== false,
      visible_from: data.visibleFrom
        ? new Date(data.visibleFrom + "T00:00:00").toISOString()
        : null,
    };
    try {
      const r = await sb("PATCH", `sponsors?id=eq.${encodeURIComponent(id)}`, payload);
      if (!r.ok) {
        const txt = await r.text();
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Supabase retornou ${r.status}: ${txt}` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/sponsors/")) {
    if (!ANON_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "SUPABASE_ANON_KEY não configurada." }));
      return;
    }
    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (!id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "id ausente." }));
      return;
    }
    try {
      const r = await sb("DELETE", `sponsors?id=eq.${encodeURIComponent(id)}`);
      if (!r.ok) {
        const txt = await r.text();
        res.writeHead(r.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Supabase retornou ${r.status}: ${txt}` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Não encontrado");
});

server.listen(PORT, () => {
  console.log(`Config web de patrocinadores (HTTP) em http://localhost:${PORT}`);
  if (!ANON_KEY) console.warn("AVISO: SUPABASE_ANON_KEY não definida (listar vai falhar).");
  if (!ANON_KEY) console.warn("AVISO: SUPABASE_ANON_KEY não definida (salvar/editar/excluir vai falhar).");
  if (ANON_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/sponsors?select=id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    })
      .then((r) =>
        console.log(
          r.ok
            ? "OK: tabela 'sponsors' acessível."
            : `AVISO: tabela 'sponsors' retornou ${r.status} (rode supabase/sponsors.sql no Supabase?).`,
        ),
      )
      .catch((e) => console.log("AVISO: não consegui testar a tabela 'sponsors':", String(e)));
  }
});
