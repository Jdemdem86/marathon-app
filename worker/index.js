/**
 * Service relais — garde les clés secrètes côté serveur.
 *
 * Ce petit service fait deux choses :
 *   1. /api/analyze          → appelle l'API Claude avec TA clé (jamais exposée au navigateur)
 *   2. /api/strava/*         → gère la connexion Strava et récupère tes activités
 *
 * Secrets à configurer (voir README) :
 *   ANTHROPIC_API_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, APP_ORIGIN
 * Stockage KV à lier : TOKENS (garde le jeton Strava entre les sessions)
 */

const MODEL = "claude-sonnet-4-6";

// L'en-tête Origin envoyé par le navigateur ne contient que le schéma + le domaine
// (ex. "https://xxx.github.io"), jamais le chemin. Il faut donc extraire la racine
// de APP_ORIGIN, sinon la comparaison échoue et le navigateur bloque l'appel.
function allowedOrigin(env) {
  try { return new URL(env.APP_ORIGIN).origin; }
  catch { return env.APP_ORIGIN || "*"; }
}

function cors(env, extra = {}) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(env),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    ...extra,
  };
}

function json(env, data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env, extra) },
  });
}

// ── Identifiant de session (cookie) — permet de retrouver TON jeton Strava ──
function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)sid=([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}
function newSessionId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 32);
}
function sessionCookie(sid) {
  // SameSite=None + Secure : nécessaire car l'app (github.io) et le service sont sur des domaines différents
  return `sid=${sid}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=None`;
}

// ── Conversion des données Strava vers le format de l'app ──────────────────
function paceString(seconds, distanceKm) {
  if (!distanceKm || distanceKm <= 0) return "";
  const secPerKm = seconds / distanceKm;
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")}`;
}

// Découpage de la séance en tours (bouton "lap" de la montre).
// Sans ce découpage, l'échauffement et le retour au calme faussent la moyenne
// et rendent l'allure du corps de séance illisible.
function formatLaps(a) {
  const laps = Array.isArray(a.laps) ? a.laps : [];
  return laps
    .filter((l) => l && l.distance > 0 && l.moving_time > 0)
    .map((l, i) => {
      const km = l.distance / 1000;
      return {
        index: i,
        name: l.name || `Tour ${i + 1}`,
        distance: km.toFixed(2),
        durationSec: Math.round(l.moving_time),
        duration: (l.moving_time / 60).toFixed(1),
        pace: paceString(l.moving_time, km),
        paceSecPerKm: Math.round(l.moving_time / km),
        hrMoy: l.average_heartrate ? String(Math.round(l.average_heartrate)) : "",
        hrMax: l.max_heartrate ? String(Math.round(l.max_heartrate)) : "",
        cadence: l.average_cadence ? String(Math.round(l.average_cadence * 2)) : "",
      };
    });
}

function formatActivity(a) {
  const distanceKm = a.distance / 1000;
  const movingMin = a.moving_time / 60;
  const paceSecPerKm = distanceKm > 0 ? a.moving_time / distanceKm : 0;
  const paceMin = Math.floor(paceSecPerKm / 60);
  const paceSec = Math.round(paceSecPerKm % 60);

  return {
    laps: formatLaps(a),
    name: a.name || "Sortie",
    date: a.start_date_local ? new Date(a.start_date_local).toLocaleDateString("fr-FR") : "",
    pace: paceSecPerKm > 0 ? `${paceMin}:${String(paceSec).padStart(2, "0")}` : "",
    hrMoy: a.average_heartrate ? String(Math.round(a.average_heartrate)) : "",
    hrMax: a.max_heartrate ? String(Math.round(a.max_heartrate)) : "",
    distance: distanceKm ? distanceKm.toFixed(2) : "",
    duration: movingMin ? String(Math.round(movingMin)) : "",
    // Strava donne la cadence par jambe : on double pour obtenir les pas/min (comme Garmin)
    cadence: a.average_cadence ? String(Math.round(a.average_cadence * 2)) : "",
    temp: a.average_temp != null ? String(Math.round(a.average_temp)) : "",
  };
}

// ── Rafraîchit le jeton Strava s'il a expiré ──────────────────────────────
async function getValidStravaToken(env, sid) {
  const raw = await env.TOKENS.get(`strava:${sid}`);
  if (!raw) return null;

  const tok = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (tok.expires_at && tok.expires_at > now + 60) return tok.access_token;

  // Expiré → on le renouvelle automatiquement (l'utilisateur n'a rien à refaire)
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tok.refresh_token,
    }),
  });
  if (!res.ok) return null;

  const fresh = await res.json();
  await env.TOKENS.put(
    `strava:${sid}`,
    JSON.stringify({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: fresh.expires_at,
    })
  );
  return fresh.access_token;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    // ─── 1. Analyse d'une séance par Claude ───────────────────────────────
    if (path === "/api/analyze" && request.method === "POST") {
      try {
        const { prompt } = await request.json();
        if (!prompt || typeof prompt !== "string") {
          return json(env, { error: "Requête invalide." }, 400);
        }
        // Garde-fou anti-abus : limite la taille du prompt accepté
        if (prompt.length > 8000) {
          return json(env, { error: "Requête trop longue." }, 400);
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1200,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          return json(env, { error: data?.error?.message || `Erreur API (${res.status})` }, 502);
        }

        const text = (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();

        return json(env, { text: text || "Analyse indisponible." });
      } catch (err) {
        return json(env, { error: `Erreur interne : ${err.message}` }, 500);
      }
    }

    // ─── 2. Strava : démarrage de la connexion ────────────────────────────
    if (path === "/api/strava/auth") {
      let sid = getSessionId(request);
      const isNew = !sid;
      if (!sid) sid = newSessionId();

      const redirectUri = `${url.origin}/api/strava/callback`;
      const authUrl =
        `https://www.strava.com/oauth/authorize?client_id=${env.STRAVA_CLIENT_ID}` +
        `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&approval_prompt=auto&scope=activity:read_all&state=${sid}`;

      const headers = { Location: authUrl, ...cors(env) };
      if (isNew) headers["Set-Cookie"] = sessionCookie(sid);
      return new Response(null, { status: 302, headers });
    }

    // ─── 3. Strava : retour après autorisation ────────────────────────────
    if (path === "/api/strava/callback") {
      const code = url.searchParams.get("code");
      const sid = url.searchParams.get("state") || getSessionId(request);

      if (!code || !sid) {
        return new Response("Autorisation Strava annulée ou invalide.", {
          status: 400,
          headers: cors(env),
        });
      }

      const res = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: env.STRAVA_CLIENT_ID,
          client_secret: env.STRAVA_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
        }),
      });

      if (!res.ok) {
        return new Response("Échec de la connexion Strava.", { status: 502, headers: cors(env) });
      }

      const tok = await res.json();
      await env.TOKENS.put(
        `strava:${sid}`,
        JSON.stringify({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token,
          expires_at: tok.expires_at,
        })
      );

      // Retour vers l'app
      return new Response(null, {
        status: 302,
        headers: {
          Location: env.APP_ORIGIN || "/",
          "Set-Cookie": sessionCookie(sid),
          ...cors(env),
        },
      });
    }

    // ─── 4. Strava : statut de connexion ──────────────────────────────────
    if (path === "/api/strava/status") {
      const sid = getSessionId(request);
      if (!sid) return json(env, { connected: false });
      const token = await getValidStravaToken(env, sid);
      return json(env, { connected: !!token });
    }

    // ─── 5. Strava : dernière course ──────────────────────────────────────
    if (path === "/api/strava/latest-run") {
      const sid = getSessionId(request);
      if (!sid) return json(env, { error: "Strava non connecté." }, 401);

      const token = await getValidStravaToken(env, sid);
      if (!token) return json(env, { error: "Strava non connecté." }, 401);

      const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=30", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) return json(env, { error: "Strava non connecté." }, 401);
      if (!res.ok) return json(env, { error: `Erreur Strava (${res.status})` }, 502);

      const activities = await res.json();
      const run = (activities || []).find((a) => a.type === "Run" || a.sport_type === "Run");
      if (!run) return json(env, { activity: null });

      // Détail de l'activité : contient plus de champs (cadence, température…)
      const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${run.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const full = detailRes.ok ? await detailRes.json() : run;

      // Le détail contient normalement les tours, mais pas toujours selon la montre
      // et la façon dont l'activité a été enregistrée : on complète si besoin.
      if (!Array.isArray(full.laps) || full.laps.length === 0) {
        try {
          const lapsRes = await fetch(`https://www.strava.com/api/v3/activities/${run.id}/laps`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (lapsRes.ok) full.laps = await lapsRes.json();
        } catch { /* les tours restent optionnels : l'analyse globale fonctionne sans */ }
      }

      return json(env, { activity: formatActivity(full) });
    }

    return json(env, { error: "Route inconnue." }, 404);
  },
};
