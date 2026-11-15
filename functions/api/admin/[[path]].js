// Beveiligd via Cloudflare Access (pad /api/admin/*). Extra check: Access-header moet aanwezig zijn.
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function onRequest({ request, env, params }) {
  if (!request.headers.get("Cf-Access-Jwt-Assertion")) return j({ error: "Geen toegang." }, 403);
  const p = (params.path || []).join("/"), m = request.method, db = env.DB;
  try {
    if (p === "list" && m === "GET") {
      const r = (await db.prepare("SELECT * FROM rsvp ORDER BY name COLLATE NOCASE").all()).results;
      const g = (await db.prepare("SELECT * FROM guests ORDER BY name COLLATE NOCASE").all()).results;
      return j({ rsvps: r, guests: g });
    }
    if (p === "guests" && m === "POST") {
      const { text = "" } = await request.json(), rows = [];
      for (const l of text.split("\n")) { const [n, e] = l.split(",").map(s => (s || "").trim()); if (n && e) rows.push([e.toLowerCase(), n]); }
      const st = [db.prepare("DELETE FROM guests")].concat(rows.map(r => db.prepare("INSERT OR REPLACE INTO guests (email,name) VALUES (?,?)").bind(...r)));
      await db.batch(st); return j({ ok: true, n: rows.length });
    }
    if (p === "rsvp" && m === "DELETE") { const { email } = await request.json(); await db.prepare("DELETE FROM rsvp WHERE email=?").bind(email).run(); return j({ ok: true }); }
    if (p === "rsvp" && m === "PUT") {
      const b = await request.json(), att = b.att === "no" ? "no" : "yes", cnt = att === "yes" ? Math.max(1, Math.min(10, +b.cnt || 1)) : 0;
      await db.prepare("UPDATE rsvp SET name=?,att=?,cnt=?,diet=?,alg=?,com=?,updated=? WHERE email=?")
        .bind(String(b.name).slice(0, 100), att, cnt, String(b.diet || "").slice(0, 60), String(b.alg || "").slice(0, 200), String(b.com || "").slice(0, 500), new Date().toISOString(), b.email).run();
      return j({ ok: true });
    }
    return j({ error: "Niet gevonden." }, 404);
  } catch (e) { return j({ error: "Serverfout." }, 500); }
}
