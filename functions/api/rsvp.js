// POST /api/rsvp  – guests register or update their reply (no account needed)
const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const DEADLINE = ""; // bv. "2027-05-01" (leeg = geen deadline)

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return j({ error: "Ongeldige aanvraag." }, 400); }
  if (b.website) return j({ ok: true }); // honeypot: bots vullen dit veld in
  const name = String(b.name || "").trim().slice(0, 100);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 150);
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
    ).bind(email, name, att, cnt, String(b.diet || "").slice(0, 60), String(b.alg || "").slice(0, 200), String(b.com || "").slice(0, 500), new Date().toISOString()).run();
    return j({ ok: true, updated: !!ex });
  } catch (e) {
    return j({ error: "Er ging iets mis bij het opslaan. Probeer het later opnieuw." }, 500);
  }
}
