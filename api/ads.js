// api/ads.js  — GET /api/ads  |  POST /api/ads  |  DELETE /api/ads
// Stockage : Vercel KV

import { kv } from "@vercel/kv";

const ADS_KEY = "mm2:ads";

async function getAds() {
  return (await kv.get(ADS_KEY)) || [];
}
async function saveAds(ads) {
  await kv.set(ADS_KEY, ads);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET : toutes les annonces ──
  if (req.method === "GET") {
    const ads = await getAds();
    return res.json({ ads });
  }

  // ── POST : créer une annonce ──
  if (req.method === "POST") {
    const { type, ownerId, user, avatarUrl, contact, offerItems, wantItems, note } = req.body;
    if (!ownerId || !type) return res.status(400).json({ error: "ownerId and type required" });

    const ads = await getAds();
    const id  = Date.now(); // unique enough
    const ad  = { id, type, ownerId, user, avatarUrl, contact, offerItems: offerItems||[], wantItems: wantItems||[], note: note||"", ts: Date.now() };
    ads.push(ad);
    // Garder max 500 annonces
    if (ads.length > 500) ads.splice(0, ads.length - 500);
    await saveAds(ads);
    return res.json({ ad });
  }

  // ── DELETE : supprimer une annonce (ownership check) ──
  if (req.method === "DELETE") {
    const { id, ownerId } = req.body;
    if (!id || !ownerId) return res.status(400).json({ error: "id and ownerId required" });

    const ads    = await getAds();
    const target = ads.find(a => a.id === id);
    if (!target)             return res.status(404).json({ error: "not found" });
    if (target.ownerId !== ownerId) return res.status(403).json({ error: "forbidden" });

    await saveAds(ads.filter(a => a.id !== id));
    return res.json({ ok: true });
  }

  res.status(405).json({ error: "method not allowed" });
}
