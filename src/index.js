// Cloudflare Worker: API voor inschrijvingen. Statische bestanden komen uit ./public.
const DEADLINE = ""; // bv. "2027-05-01" (leeg = geen deadline)
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

async function rsvp(request, env) {
  let b;
  try { b = await request.json(); } catch { return j({ error: "Ongeldige aanvraag." }, 400); }
  if (b.website) return j({ ok: true }); // honeypot
  const name = clip(b.name, 100), email = clip(b.email, 150).toLowerCase();
  const att = b.att === "yes" || b.att === "no" ? b.att : "";
  const cnt = att === "yes" ? parseInt(b.cnt, 10) : 0;
  if (name.length < 2) return j({ error: "Vul je volledige naam in." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ error: "Vul een geldig e-mailadres in." }, 400);
  if (!att) return j({ error: "Laat weten of je erbij bent." }, 400);
  if (att === "yes" && !(cnt >= 1 && cnt <= 10)) return j({ error: "Aantal personen moet tussen 1 en 10 liggen." }, 400);
  if (b.consent !== true) return j({ error: "Geef toestemming voor het bewaren van je gegevens." }, 400);
  try {
    const ex = await env.DB.prepare("SELECT 1 FROM rsvp WHERE email=?").bind(email).first();
    if (ex && !b.update) return j({ exists: true }, 409);
    if (DEADLINE && !ex && new Date() > new Date(DEADLINE + "T23:59:59")) return j({ error: "Inschrijven is gesloten. Neem contact met ons op." }, 403);
    await env.DB.prepare(
      `INSERT INTO rsvp (email,name,att,cnt,diet,alg,com,updated) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET name=excluded.name,att=excluded.att,cnt=excluded.cnt,diet=excluded.diet,alg=excluded.alg,com=excluded.com,updated=excluded.updated`
    ).bind(email, name, att, cnt, clip(b.diet, 60), clip(b.alg, 200), clip(b.com, 500), new Date().toISOString()).run();
    return j({ ok: true, updated: !!ex });
  } catch { return j({ error: "Er ging iets mis bij het opslaan. Probeer het later opnieuw." }, 500); }
}

async function admin(request, env, p) {
  if (!request.headers.get("Cf-Access-Jwt-Assertion")) return j({ error: "Geen toegang." }, 403);
  const m = request.method, db = env.DB;
  try {
    if (p === "list" && m === "GET") {
      const r = (await db.prepare("SELECT * FROM rsvp ORDER BY name COLLATE NOCASE").all()).results;
      const g = (await db.prepare("SELECT * FROM guests ORDER BY name COLLATE NOCASE").all()).results;
      return j({ rsvps: r, guests: g });
    }
    if (p === "guests" && m === "POST") {
      const { text = "" } = await request.json(), rows = [];
      for (const l of text.split("\n")) { const [n, e] = l.split(",").map(s => (s || "").trim()); if (n && e) rows.push([e.toLowerCase(), n]); }
      await db.batch([db.prepare("DELETE FROM guests")].concat(rows.map(r => db.prepare("INSERT OR REPLACE INTO guests (email,name) VALUES (?,?)").bind(...r))));
      return j({ ok: true, n: rows.length });
    }
    if (p === "rsvp" && m === "DELETE") { const { email } = await request.json(); await db.prepare("DELETE FROM rsvp WHERE email=?").bind(email).run(); return j({ ok: true }); }
    if (p === "rsvp" && m === "PUT") {
      const b = await request.json(), att = b.att === "no" ? "no" : "yes", cnt = att === "yes" ? Math.max(1, Math.min(10, +b.cnt || 1)) : 0;
      await db.prepare("UPDATE rsvp SET name=?,att=?,cnt=?,diet=?,alg=?,com=?,updated=? WHERE email=?")
        .bind(clip(b.name, 100), att, cnt, clip(b.diet, 60), clip(b.alg, 200), clip(b.com, 500), new Date().toISOString(), b.email).run();
      return j({ ok: true });
    }
    return j({ error: "Niet gevonden." }, 404);
  } catch { return j({ error: "Serverfout." }, 500); }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/rsvp" && request.method === "POST") return rsvp(request, env);
    if (pathname.startsWith("/api/admin/")) return admin(request, env, pathname.slice("/api/admin/".length));
    if (pathname.startsWith("/api/")) return j({ error: "Niet gevonden." }, 404);
    return env.ASSETS.fetch(request);
  },
};
