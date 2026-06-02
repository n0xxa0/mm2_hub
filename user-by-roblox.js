// api/user-by-roblox.js — Vercel Serverless Function
// Permet au bot de trouver l'userId du site à partir d'un username Roblox
// Le site stocke robloxUser dans le profil utilisateur (localStorage)
// mais comme le bot n'a pas accès au localStorage, on utilise KV comme bridge :
// Quand un user connecté clique "Lier mon compte Roblox", le site POST ici.

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const BOT_SECRET = process.env.BOT_SECRET;

async function kvSet(key, value) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([["SET", key, JSON.stringify(value)]]),
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bot-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── POST : le site enregistre le lien robloxUsername → userId ──
  // Appelé depuis index.html quand l'utilisateur entre son username Roblox
  if (req.method === "POST") {
    const { userId, robloxUsername } = req.body;
    if (!userId || !robloxUsername) {
      return res.status(400).json({ error: "userId et robloxUsername requis" });
    }
    // Stocke le mapping username_roblox (lowercase) → userId du site
    await kvSet(`rblx:${robloxUsername.toLowerCase()}`, { userId, robloxUsername });
    return res.status(200).json({ ok: true });
  }

  // ── GET : le bot cherche l'userId à partir d'un username Roblox ──
  if (req.method === "GET") {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: "username requis" });
    const data = await kvGet(`rblx:${username.toLowerCase()}`);
    if (!data) return res.status(404).json({ error: "Utilisateur non trouvé" });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
