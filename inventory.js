// api/inventory.js — Vercel Serverless Function
// Scan direct de l'inventaire Roblox via API publique + cache KV 24h
//
// Variables d'environnement Vercel requises :
//   KV_REST_API_URL    → depuis Vercel Dashboard > Storage > KV
//   KV_REST_API_TOKEN  → depuis Vercel Dashboard > Storage > KV
//   ROBLOX_COOKIE      → .ROBLOSECURITY d'un compte Roblox (pour lire les inventaires privés)

const KV_URL      = process.env.KV_REST_API_URL;
const KV_TOKEN    = process.env.KV_REST_API_TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE; // optionnel — permet de lire les inventaires privés

// ── MM2 item database ────────────────────────────────────────────────────────
const RARITY_MAP = {
  // Chroma
  "Chroma Traveler's Gun":"Chroma","Chroma Evergun":"Chroma","Chroma Evergreen":"Chroma",
  "Chroma Bauble":"Chroma","Chroma Constellation":"Chroma","Chroma Vampire's Gun":"Chroma",
  "Chroma Alienbeam":"Chroma","Chroma Raygun":"Chroma","Chroma Sunrise":"Chroma",
  "Chroma Snowcannon":"Chroma","Chroma Blizzard":"Chroma","Chroma Sunset":"Chroma",
  "Chroma Snow Dagger":"Chroma","Chroma Treat":"Chroma","Chroma Heart Wand":"Chroma",
  "Chroma Snowstorm":"Chroma","Chroma Watergun":"Chroma","Chroma Sweet":"Chroma",
  "Chroma Ornament":"Chroma","Chroma Darkbringer":"Chroma","Chroma Lightbringer":"Chroma",
  "Chroma Luger":"Chroma","Chroma Candleflame":"Chroma","Chroma Elderwood Blade":"Chroma",
  "Chroma Swirly Gun":"Chroma","Chroma Laser":"Chroma","Chroma Cookiecane":"Chroma",
  "Chroma Deathshard":"Chroma","Chroma Slasher":"Chroma","Chroma Fang":"Chroma",
  "Chroma Shark":"Chroma","Chroma Gemstone":"Chroma","Chroma Gingerblade":"Chroma",
  "Chroma Heat":"Chroma","Chroma Seer":"Chroma","Chroma Saw":"Chroma",
  "Chroma Tides":"Chroma","Chroma Boneblade":"Chroma",
  // Ancient
  "Elderwood Scythe":"Ancient","Hallowscythe":"Ancient","Logchopper":"Ancient",
  "Icebreaker":"Ancient","Swirly Axe":"Ancient","Reaver (EVO)":"Ancient",
  "Icecrusher (EVO)":"Ancient","Batwing":"Ancient","Icewing":"Ancient",
  "Elderbeam":"Ancient","Traveler's Axe":"Ancient","Vampire's Axe":"Ancient",
  "Gingerscythe (EVO)":"Ancient","Synthwave (EVO)":"Ancient",
  "Celestial (Ancient)":"Ancient","Swirlyblade":"Ancient",
  "Harvester":"Ancient","Icepiercer":"Ancient","Gingerscope":"Ancient",
  // Godly
  "Seer":"Godly","Corrupt":"Unique",
};

const VALUE_MAP = {
  "Chroma Traveler's Gun":308025,"Chroma Evergun":105413,"Chroma Evergreen":82140,
  "Chroma Bauble":52022,"Chroma Constellation":49284,"Chroma Vampire's Gun":47915,
  "Chroma Alienbeam":41070,"Chroma Raygun":20193,"Chroma Sunrise":15401,
  "Elderwood Scythe":95000,"Hallowscythe":72000,"Logchopper":58000,
  "Icebreaker":48000,"Swirly Axe":42000,"Seer":1,
};

// ── KV helpers ───────────────────────────────────────────────────────────────
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

// ── Récupère le Roblox userId depuis un username ──────────────────────────────
async function getRobloxUserId(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.id ?? null;
}

// ── Scan inventaire MM2 via API Roblox ────────────────────────────────────────
async function scanRobloxInventory(robloxUserId) {
  const items = [];
  let cursor = "";
  let page = 0;

  const headers = { "User-Agent": "MM2Hub/1.0" };
  if (ROBLOX_COOKIE) headers["Cookie"] = `.ROBLOSECURITY=${ROBLOX_COOKIE}`;

  do {
    const url = `https://inventory.roblox.com/v2/users/${robloxUserId}/inventory?assetTypes=4&limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers });

    if (res.status === 403) {
      // Inventaire privé — retourne un tableau vide avec un flag
      return { items: [], private: true };
    }

    if (!res.ok) break;

    const data = await res.json();
    if (!data.data) break;

    for (const asset of data.data) {
      const name = asset.name || asset.assetName || "";
      if (!name) continue;

      const isKnown = RARITY_MAP[name];
      const isChroma = name.toLowerCase().includes("chroma");
      const isSeer = name.toLowerCase().includes("seer");
      const isWeapon = ["blade","shard","knife","gun","axe","scythe","shot",
        "sword","dagger","wand","cannon","beam","bringer"].some(k => name.toLowerCase().includes(k));

      if (isKnown || isChroma || isSeer || isWeapon) {
        items.push({
          name,
          rarity: RARITY_MAP[name] || guessRarity(name),
          value: VALUE_MAP[name] || 0,
          assetId: asset.assetId || asset.id,
        });
      }
    }

    cursor = data.nextPageCursor || "";
    page++;
    if (page > 20) break;

    // Petit délai anti rate-limit
    await new Promise(r => setTimeout(r, 300));
  } while (cursor);

  // Dédoublonne
  const seen = new Set();
  return {
    items: items.filter(item => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    }),
    private: false,
  };
}

function guessRarity(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("chroma")) return "Chroma";
  if (["elderwood scythe","hallowscythe","logchopper","icebreaker","swirly axe"]
    .some(n => lower.includes(n))) return "Ancient";
  return "Godly";
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-bot-secret");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── POST /api/inventory?action=scan — déclenché depuis le site ──────────────
  // Body : { userId, robloxUsername }
  // Le site envoie ça quand le joueur clique "Scanner mon inventaire"
  if (req.method === "POST") {
    const { userId, robloxUsername, action } = req.body ?? {};

    // Ancien chemin : le bot envoyait directement les items (on garde la compat)
    if (req.headers["x-bot-secret"] && Array.isArray(req.body?.items)) {
      const botSecret = process.env.BOT_SECRET;
      if (req.headers["x-bot-secret"] !== botSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { items, scannedAt } = req.body;
      await kvSet(`inv:${userId}`, {
        userId, robloxUsername: robloxUsername || "unknown",
        items, scannedAt: scannedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(), source: "bot",
      }, 86400);
      return res.status(200).json({ ok: true, count: items.length });
    }

    // Nouveau chemin : scan direct API Roblox
    if (!userId || !robloxUsername) {
      return res.status(400).json({ error: "userId et robloxUsername requis" });
    }

    // Vérifie si le cache est encore frais (moins de 10 min)
    const cached = await kvGet(`inv:${userId}`);
    if (cached && cached.updatedAt) {
      const age = Date.now() - new Date(cached.updatedAt).getTime();
      if (age < 10 * 60 * 1000) {
        return res.status(200).json({ ...cached, cached: true });
      }
    }

    // Résout le Roblox userId depuis le username
    const robloxUserId = await getRobloxUserId(robloxUsername);
    if (!robloxUserId) {
      return res.status(404).json({ error: `Compte Roblox "${robloxUsername}" introuvable` });
    }

    // Scanne l'inventaire
    const { items, private: isPrivate } = await scanRobloxInventory(robloxUserId);

    if (isPrivate) {
      return res.status(403).json({
        error: "Inventaire privé",
        message: "Rends ton inventaire public dans les paramètres Roblox pour le scanner.",
        items: [],
      });
    }

    const payload = {
      userId,
      robloxUsername,
      robloxUserId,
      items,
      scannedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "api",
    };

    // Cache 24h dans KV
    await kvSet(`inv:${userId}`, payload, 86400);

    return res.status(200).json({ ok: true, count: items.length, ...payload });
  }

  // ── GET /api/inventory?userId=xxx — lit le cache ────────────────────────────
  if (req.method === "GET") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId requis" });

    const data = await kvGet(`inv:${userId}`);
    if (!data) return res.status(404).json({ error: "Inventaire non trouvé — clique Scanner", items: [] });

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
