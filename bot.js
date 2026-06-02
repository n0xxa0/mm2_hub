// bot/bot.js — MM2 Hub Bot (noblox.js)
// ────────────────────────────────────────────────────────────────────────────
// Installe les dépendances : npm install noblox.js node-fetch dotenv
// Crée un fichier .env dans /bot/ avec les variables ci-dessous
// Lance avec : node bot.js
// ────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const noblox = require("noblox.js");
const fetch  = require("node-fetch");

// ── Config (depuis .env) ─────────────────────────────────────────────────────
const ROBLOX_COOKIE    = process.env.ROBLOX_COOKIE;       // .ROBLOSECURITY cookie du compte bot
const PRIVATE_SERVER_CODE = process.env.PRIVATE_SERVER_CODE; // Code du serveur privé (link share code)
const GAME_ID          = process.env.GAME_ID;             // ID du jeu MM2 (ex: 142823291)
const API_URL          = process.env.API_URL;             // https://ton-site.vercel.app/api/inventory
const BOT_SECRET       = process.env.BOT_SECRET;          // Même secret que dans Vercel
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "10000"); // 10s par défaut

// ── MM2 item database (nom Roblox → rareté) ──────────────────────────────────
// Utilisée pour enrichir les items bruts de l'inventaire
const RARITY_MAP = {
  // Chroma
  "Chroma Traveler's Gun": "Chroma", "Chroma Evergun": "Chroma", "Chroma Evergreen": "Chroma",
  "Chroma Bauble": "Chroma", "Chroma Constellation": "Chroma", "Chroma Vampire's Gun": "Chroma",
  "Chroma Alienbeam": "Chroma", "Chroma Raygun": "Chroma", "Chroma Sunrise": "Chroma",
  "Chroma Snowcannon": "Chroma", "Chroma Blizzard": "Chroma", "Chroma Sunset": "Chroma",
  "Chroma Snow Dagger": "Chroma", "Chroma Treat": "Chroma", "Chroma Heart Wand": "Chroma",
  "Chroma Snowstorm": "Chroma", "Chroma Watergun": "Chroma", "Chroma Sweet": "Chroma",
  "Chroma Ornament": "Chroma", "Chroma Darkbringer": "Chroma", "Chroma Lightbringer": "Chroma",
  "Chroma Luger": "Chroma", "Chroma Candleflame": "Chroma", "Chroma Elderwood Blade": "Chroma",
  "Chroma Swirly Gun": "Chroma", "Chroma Laser": "Chroma", "Chroma Cookiecane": "Chroma",
  "Chroma Deathshard": "Chroma", "Chroma Slasher": "Chroma", "Chroma Fang": "Chroma",
  "Chroma Shark": "Chroma", "Chroma Gemstone": "Chroma", "Chroma Gingerblade": "Chroma",
  "Chroma Heat": "Chroma", "Chroma Seer": "Chroma", "Chroma Saw": "Chroma",
  "Chroma Tides": "Chroma", "Chroma Boneblade": "Chroma",
  // Ancient
  "Elderwood Scythe": "Ancient", "Hallowscythe": "Ancient", "Logchopper": "Ancient",
  "Icebreaker": "Ancient", "Swirly Axe": "Ancient", "Reaver (EVO)": "Ancient",
  "Icecrusher (EVO)": "Ancient", "Batwing": "Ancient", "Icewing": "Ancient",
  "Elderbeam": "Ancient", "Traveler's Axe": "Ancient", "Vampire's Axe": "Ancient",
  "Gingerscythe (EVO)": "Ancient", "Synthwave (EVO)": "Ancient",
  "Celestial (Ancient)": "Ancient", "Swirlyblade": "Ancient",
  "Harvester": "Ancient", "Icepiercer": "Ancient", "Gingerscope": "Ancient",
  // Godly (quelques clés, la liste complète est dans index.html)
  "Seer": "Godly", "Corrupt": "Unique",
};

// ── Valeurs de référence (synchronisées avec EMBEDDED_VALUES du site) ─────────
const VALUE_MAP = {
  "Chroma Traveler's Gun": 308025, "Chroma Evergun": 105413, "Chroma Evergreen": 82140,
  "Chroma Bauble": 52022, "Chroma Constellation": 49284, "Chroma Vampire's Gun": 47915,
  "Chroma Alienbeam": 41070, "Chroma Raygun": 20193, "Chroma Sunrise": 15401,
  "Elderwood Scythe": 95000, "Hallowscythe": 72000, "Logchopper": 58000,
  "Icebreaker": 48000, "Swirly Axe": 42000, "Seer": 1,
  // Ajoute d'autres items selon besoin
};

// ── État global ───────────────────────────────────────────────────────────────
let botUserId = null;
let isProcessingTrade = false;

// ── Connexion ─────────────────────────────────────────────────────────────────
async function login() {
  try {
    await noblox.setCookie(ROBLOX_COOKIE);
    const info = await noblox.getPlayerInfo(await noblox.getIdFromCookie(ROBLOX_COOKIE));
    botUserId = await noblox.getIdFromCookie(ROBLOX_COOKIE);
    console.log(`[BOT] Connecté en tant que ${info.username} (${botUserId})`);
  } catch (e) {
    console.error("[BOT] Erreur de connexion Roblox:", e.message);
    process.exit(1);
  }
}

// ── Récupère l'inventaire MM2 d'un joueur via l'API Roblox ────────────────────
// MM2 utilise les "collectibles" / "assets" du jeu
async function getMM2Inventory(userId) {
  const items = [];
  let cursor = "";
  let page = 0;

  // L'API Roblox inventory endpoint
  const BASE = `https://inventory.roblox.com/v2/users/${userId}/inventory`;

  // On scanne les asset types 4 (Gear) — MM2 stocke les armes comme Gear
  try {
    do {
      const url = `${BASE}?assetTypes=4&limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await fetch(url, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
          "User-Agent": "MM2Hub-Bot/1.0",
        },
      });

      if (res.status === 403) {
        console.warn(`[BOT] Inventaire privé pour userId ${userId}`);
        return null; // inventaire privé
      }

      const data = await res.json();
      if (!data.data) break;

      for (const asset of data.data) {
        const name = asset.name || asset.assetName || "";
        if (!name) continue;
        // Filtre basique : on garde les items qui ressemblent à des armes MM2
        if (RARITY_MAP[name] || name.toLowerCase().includes("chroma") ||
            name.toLowerCase().includes("seer") || isKnownMM2Item(name)) {
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
      if (page > 20) break; // sécurité anti-boucle infinie

      // Pause pour éviter le rate-limit Roblox
      await sleep(500);
    } while (cursor);
  } catch (e) {
    console.error("[BOT] Erreur récupération inventaire:", e.message);
    return null;
  }

  // Dédoublonne par nom
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function isKnownMM2Item(name) {
  // Heuristic: la plupart des armes MM2 ont ces mots-clés
  const keywords = ["blade", "shard", "knife", "gun", "axe", "scythe", "shot",
                    "sword", "dagger", "wand", "cannon", "beam", "bringer"];
  const lower = name.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function guessRarity(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("chroma")) return "Chroma";
  if (["elderwood scythe","hallowscythe","logchopper","icebreaker","swirly axe"]
      .some(n => lower.includes(n))) return "Ancient";
  return "Godly"; // fallback
}

// ── Envoie l'inventaire à l'API du site ──────────────────────────────────────
async function postInventory(userId, robloxUsername, items) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": BOT_SECRET,
      },
      body: JSON.stringify({
        userId,          // l'ID utilisateur du SITE (pas Roblox)
        robloxUsername,
        items,
        scannedAt: new Date().toISOString(),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[BOT] ✅ Inventaire envoyé : ${data.count} items pour ${robloxUsername} (siteId: ${userId})`);
    } else {
      console.error("[BOT] Erreur API:", data);
    }
  } catch (e) {
    console.error("[BOT] Erreur envoi inventaire:", e.message);
  }
}

// ── Écoute les demandes de trade entrants ─────────────────────────────────────
async function watchTrades() {
  console.log("[BOT] 👀 Surveillance des trades active...");

  setInterval(async () => {
    if (isProcessingTrade) return;

    try {
      // Récupère les trades entrants en attente
      const inbound = await noblox.getTrades("Inbound");
      if (!inbound || inbound.length === 0) return;

      for (const trade of inbound) {
        if (isProcessingTrade) break;
        isProcessingTrade = true;

        const initiatorId = trade.user.id;
        const initiatorName = trade.user.name;
        console.log(`[BOT] 🔄 Trade reçu de ${initiatorName} (${initiatorId})`);

        // 1. Scanne l'inventaire du joueur
        const items = await getMM2Inventory(initiatorId);

        if (items === null) {
          console.log(`[BOT] ⚠️ Inventaire privé ou inaccessible pour ${initiatorName}`);
          // Decline le trade
          await noblox.declineTrade(trade.id).catch(() => {});
          isProcessingTrade = false;
          continue;
        }

        console.log(`[BOT] 📦 ${items.length} items trouvés pour ${initiatorName}`);

        // 2. Cherche le userId du site lié à ce compte Roblox
        // Le userId du site = récupéré via l'API (le site stocke robloxUser dans le profil)
        const siteUserId = await getSiteUserIdByRoblox(initiatorName);

        if (siteUserId) {
          await postInventory(siteUserId, initiatorName, items);
        } else {
          // Fallback: on utilise l'username Roblox comme clé temporaire
          await postInventory(`roblox_${initiatorName.toLowerCase()}`, initiatorName, items);
          console.log(`[BOT] ⚠️ Pas de compte site trouvé pour ${initiatorName}, stocké sous clé temporaire`);
        }

        // 3. Decline le trade (on ne veut pas vraiment trader, juste scanner)
        await noblox.declineTrade(trade.id).catch(() => {});
        console.log(`[BOT] ✅ Trade décliné après scan`);

        isProcessingTrade = false;
        await sleep(2000);
      }
    } catch (e) {
      if (!e.message.includes("No trades")) {
        console.error("[BOT] Erreur watchTrades:", e.message);
      }
      isProcessingTrade = false;
    }
  }, SCAN_INTERVAL_MS);
}

// ── Cherche l'userId du site à partir du username Roblox ──────────────────────
// Le site doit exposer un endpoint GET /api/user-by-roblox?username=xxx
async function getSiteUserIdByRoblox(robloxUsername) {
  try {
    const url = API_URL.replace("/inventory", `/user-by-roblox?username=${encodeURIComponent(robloxUsername)}`);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.userId || null;
  } catch {
    return null;
  }
}

// ── Utilitaire ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
(async () => {
  console.log("╔══════════════════════════════════╗");
  console.log("║       MM2 Hub Bot v1.0           ║");
  console.log("╚══════════════════════════════════╝");

  await login();
  await watchTrades();

  // Keep-alive log toutes les 5 min (utile pour Katabump)
  setInterval(() => {
    console.log(`[BOT] 💓 Alive — ${new Date().toLocaleTimeString()}`);
  }, 300000);
})();
