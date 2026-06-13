// api/profiles.js  — GET /api/profiles?id=XXX  |  POST /api/profiles
// Stockage : Vercel KV (Redis)
// Setup : https://vercel.com/docs/storage/vercel-kv

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET : récupérer un ou tous les profils ──
  if (req.method === "GET") {
    const { id } = req.query;
    if (id) {
      const profile = await kv.get(`profile:${id}`);
      if (!profile) return res.status(404).json({ error: "not found" });
      return res.json({ profile });
    }
    // Retourner tous les profils (pour le cache local)
    const keys = await kv.keys("profile:*");
    const profiles = {};
    if (keys.length) {
      const values = await kv.mget(...keys);
      keys.forEach((k, i) => {
        const p = values[i];
        if (p) profiles[p.id] = p;
      });
    }
    return res.json({ profiles });
  }

  // ── POST : créer / mettre à jour un profil ──
  if (req.method === "POST") {
    const { id, robloxName, displayName, avatarUrl, bio } = req.body;
    if (!id || !robloxName) return res.status(400).json({ error: "id and robloxName required" });

    // Lire le profil existant pour ne pas écraser la bio si déjà renseignée
    const existing = (await kv.get(`profile:${id}`)) || {};

    const profile = {
      id,
      robloxName,
      displayName: displayName || robloxName,
      avatarUrl:   avatarUrl || existing.avatarUrl || null,
      bio:         bio !== undefined ? bio : (existing.bio || ""),
      createdAt:   existing.createdAt || Date.now(),
      updatedAt:   Date.now(),
    };

    await kv.set(`profile:${id}`, profile);
    return res.json({ profile });
  }

  res.status(405).json({ error: "method not allowed" });
}
