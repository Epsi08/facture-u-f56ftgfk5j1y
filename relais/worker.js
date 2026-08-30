/* Relais pour la lecture des tickets Super U.
 *
 * Rôle : détenir la clé API Anthropic côté serveur, pour qu'elle ne soit JAMAIS
 * dans la page web (une clé dans une page publique est lisible et facturable par tous).
 *
 * Le navigateur envoie seulement { image: "<base64 jpeg>" }.
 * Le prompt, le modèle et les plafonds sont fixés ici : même si quelqu'un trouvait
 * l'URL, il ne pourrait que faire lire un ticket de caisse, rien d'autre.
 */

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // ~5 Mo de base64
const RATE_LIMIT = 20;                      // requêtes par IP
const RATE_WINDOW_MS = 10 * 60 * 1000;      // sur 10 minutes

const PROMPT = [
  "Tu lis un ticket de caisse Super U / Hyper U / U Express.",
  "Extrais exactement ces 5 informations, telles qu'imprimées :",
  '- magasin : le code magasin (5 chiffres, imprimé après "Magasin" en haut, et repris dans la ligne du bas)',
  '- ticket : le numéro du ticket (colonne "Tick" de la ligne du bas)',
  "- date : la date d'émission au format JJ/MM/AAAA (année sur 4 chiffres, complète 20xx si le ticket n'affiche que 2 chiffres)",
  "- montant : le montant TOTAL TTC, avec une virgule comme séparateur décimal, sans symbole euro",
  '- caisse : le code caisse (colonne "Ou" / numéro de caisse de la ligne du bas)',
  "Réponds UNIQUEMENT par un objet JSON, sans texte autour et sans balises markdown :",
  '{"magasin":"","ticket":"","date":"","montant":"","caisse":""}',
  "Si une valeur est illisible, mets une chaîne vide."
].join('\n');

/* Compteur en mémoire : suffisant pour un usage personnel.
   Il se remet à zéro quand Cloudflare recycle l'instance — c'est un garde-fou, pas un verrou. */
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);
  if (hits.size > 1000) hits.clear();
  return seen.length > RATE_LIMIT;
}

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

const json = (obj, status, headers) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers }
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ORIGINES_AUTORISEES || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405, cors);

    if (allowed.length && !allowed.includes(origin)) {
      return json({ error: 'Origine non autorisée' }, 403, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'Clé API non configurée sur le relais' }, 500, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
    if (rateLimited(ip)) return json({ error: 'Trop de requêtes' }, 429, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Requête illisible' }, 400, cors); }

    const image = body && body.image;
    if (typeof image !== 'string' || !image) return json({ error: 'Image manquante' }, 400, cors);
    if (image.length > MAX_IMAGE_BYTES) return json({ error: 'Image trop lourde' }, 413, cors);

    let upstream;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
              { type: 'text', text: PROMPT }
            ]
          }]
        })
      });
    } catch {
      return json({ error: 'Service de lecture injoignable' }, 502, cors);
    }

    if (!upstream.ok) {
      let detail = '';
      try { detail = (await upstream.json()).error.message; } catch {}
      /* La clé ne doit jamais fuiter dans un message d'erreur renvoyé au navigateur. */
      return json({ error: 'Lecture refusée (' + upstream.status + ')', detail }, upstream.status, cors);
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return json({ error: 'Réponse inattendue' }, 502, cors);

    let out;
    try { out = JSON.parse(clean.slice(s, e + 1)); }
    catch { return json({ error: 'Réponse illisible' }, 502, cors); }

    /* On ne renvoie que les 5 champs attendus. */
    const champs = ['magasin', 'ticket', 'date', 'montant', 'caisse'];
    const propre = {};
    for (const c of champs) propre[c] = typeof out[c] === 'string' ? out[c] : '';
    return json(propre, 200, cors);
  }
};
