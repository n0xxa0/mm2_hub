// api/inventory.js — Vercel Serverless Function
// Stockage via Vercel KV (Redis). Setup: vercel.com/dashboard → Storage → KV
// Variables d'environnement requises:
//   KV_REST_API_URL      (depuis le dashboard Vercel KV)
//   KV_REST_API_TOKEN    (depuis le dashboard Vercel KV)
//   BOT_SECRET           (une clé secrète que tu choisis, ex: "monSecretBot123")

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const BOT_SECRET = process.env.BOT_SECRET;

// ── Helpers KV REST API ──────────────────────────────────────────────────────
async function kvSet(key, value, exSeconds) {
  const body = exSeconds
    ? ["SET", key, JSON.stringify(value), "EX", String(exSeconds)]
    : ["SET", key, JSON.stringify(value)];
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([body]),
  });
  return res.ok;
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.result) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — autoriser le site à lire l'inventaire
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bot-secret");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ── POST /api/inventory — le bot envoie l'inventaire ──
  if (req.method === "POST") {
    // Vérification du secret bot
    const secret = req.headers["x-bot-secret"];
    if (!BOT_SECRET || secret !== BOT_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { userId, robloxUsername, items, scannedAt } = req.body;
    if (!userId || !Array.isArray(items)) {
      return res.status(400).json({ error: "userId et items requis" });
    }

    const payload = {
      userId,
      robloxUsername: robloxUsername || "unknown",
      items,           // [{ name, rarity, value }]
      scannedAt: scannedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Expire après 24h (le bot doit re-scanner si l'utilisateur revient)
    await kvSet(`inv:${userId}`, payload, 86400);

    return res.status(200).json({ ok: true, count: items.length });
  }

  // ── GET /api/inventory?userId=xxx — le site lit l'inventaire ──
  if (req.method === "GET") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId requis" });

    const data = await kvGet(`inv:${userId}`);
    if (!data) return res.status(404).json({ error: "Inventaire non trouvé", items: [] });

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
