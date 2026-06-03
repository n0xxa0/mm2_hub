// api/values.js — Vercel Serverless Function
// Lit les données depuis /public/data/*.json (générés par l'extracteur navigateur)
// Plus de scraping Cloudflare — impossible depuis un serveur.

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const RARITIES = ["Chroma","Ancient","Godly","Vintage","Legendary","Rare","Uncommon","Common"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");

  const all = [];
  const missing = [];

  for (const rarity of RARITIES) {
    const filePath = join(process.cwd(), "public", "data", `mm2_${rarity.toLowerCase()}_items.json`);
    if (existsSync(filePath)) {
      try {
        const items = JSON.parse(readFileSync(filePath, "utf-8"));
        all.push(...items);
      } catch (e) {
        missing.push(`${rarity}: parse error`);
      }
    } else {
      missing.push(`${rarity}: fichier manquant`);
    }
  }

  if (!all.length) {
    return res.status(404).json({
      error: "Aucun fichier de données trouvé.",
      hint: "Lance l'extracteur navigateur sur supremevalues.com et place les JSON dans /public/data/",
      missing
    });
  }

  return res.json({
    items: all,
    total: all.length,
    missing: missing.length ? missing : undefined,
    cachedAt: new Date().toISOString()
  });
}
