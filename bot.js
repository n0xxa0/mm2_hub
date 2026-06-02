// bot/bot.js — MM2 Hub Bot (noblox.js) v2.0
// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE :
//   1. Le bot rejoint le serveur privé MM2 via Roblox Game Join API
//   2. Un LocalScript Roblox (BotBridge.lua) tourne dans le serveur privé
//      et notifie le bot Node.js quand un joueur arrive
//   3. noblox.js reçoit les trades entrants et scanne les inventaires
//
// PRÉREQUIS :
//   - Un compte Roblox bot avec TradePrivacy = "All" dans les settings
//   - Le serveur privé MM2 créé avec ton compte (PRIVATE_SERVER_CODE dans .env)
//   - BotBridge.lua installé dans un Script/LocalScript du serveur privé (voir ci-dessous)
//   - npm install noblox.js node-fetch dotenv express
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const noblox = require("noblox.js");
const fetch  = require("node-fetch");
const express = require("express");

// ── Config ────────────────────────────────────────────────────────────────────
const ROBLOX_COOKIE       = process.env.ROBLOX_COOKIE;
const PRIVATE_SERVER_CODE = process.env.PRIVATE_SERVER_CODE; // ex: "abc123XYZ"
const GAME_ID             = process.env.GAME_ID;             // ex: "142823291"
const PLACE_ID            = process.env.PLACE_ID || GAME_ID;
const API_URL             = process.env.API_URL;
const BOT_SECRET          = process.env.BOT_SECRET;
const BRIDGE_SECRET       = process.env.BRIDGE_SECRET;       // Secret partagé avec BotBridge.lua
const SCAN_INTERVAL_MS    = parseInt(process.env.SCAN_INTERVAL_MS || "8000");
const BRIDGE_PORT         = parseInt(process.env.BRIDGE_PORT || "3001");

// ── MM2 item database ────────────────────────────────────────────────────────
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
  // Godly
  "Seer": "Godly", "Corrupt": "Unique",
};

const VALUE_MAP = {
  "Chroma Traveler's Gun": 308025, "Chroma Evergun": 105413, "Chroma Evergreen": 82140,
  "Chroma Bauble": 52022, "Chroma Constellation": 49284, "Chroma Vampire's Gun": 47915,
  "Chroma Alienbeam": 41070, "Chroma Raygun": 20193, "Chroma Sunrise": 15401,
  "Elderwood Scythe": 95000, "Hallowscythe": 72000, "Logchopper": 58000,
  "Icebreaker": 48000, "Swirly Axe": 42000, "Seer": 1,
};

// ── État global ───────────────────────────────────────────────────────────────
let botUserId = null;
let isProcessingTrade = false;
// File d'attente des joueurs présents dans le serveur privé
// (remplie par BotBridge.lua via POST /bridge/player-arrived)
const playersInServer = new Set();

// ═════════════════════════════════════════════════════════════════════════════
// 1. BRIDGE HTTP — reçoit les notifications du script Roblox
// ═════════════════════════════════════════════════════════════════════════════
// Le script Lua dans MM2 appelle POST http://<ton-ip>:3001/bridge/player-arrived
// quand un joueur rejoint le serveur privé.
// IMPORTANT : expose ce port publiquement ou utilise ngrok/Cloudflare Tunnel.

function startBridgeServer() {
  const app = express();
  app.use(express.json());

  // Le script Roblox signale qu'un joueur est arrivé dans le serveur
  app.post("/bridge/player-arrived", (req, res) => {
    const { secret, robloxUserId, robloxUsername } = req.body;

    if (secret !== BRIDGE_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (robloxUserId && robloxUsername) {
      console.log(`[BRIDGE] 🟢 Joueur arrivé dans le serveur : ${robloxUsername} (${robloxUserId})`);
      playersInServer.add(JSON.stringify({ id: robloxUserId, name: robloxUsername }));
    }

    res.json({ ok: true });
  });

  // Le script Roblox signale qu'un joueur a quitté
  app.post("/bridge/player-left", (req, res) => {
    const { secret, robloxUserId, robloxUsername } = req.body;
    if (secret !== BRIDGE_SECRET) return res.status(401).json({ error: "Unauthorized" });

    // Retire le joueur de la file
    for (const entry of playersInServer) {
      const p = JSON.parse(entry);
      if (String(p.id) === String(robloxUserId)) {
        playersInServer.delete(entry);
        console.log(`[BRIDGE] 🔴 Joueur parti : ${robloxUsername}`);
        break;
      }
    }
    res.json({ ok: true });
  });

  // Health check
  app.get("/bridge/health", (_, res) => res.json({ alive: true, players: playersInServer.size }));

  app.listen(BRIDGE_PORT, () => {
    console.log(`[BRIDGE] 🌐 Serveur bridge actif sur le port ${BRIDGE_PORT}`);
    console.log(`[BRIDGE] 📌 Configure ngrok ou Cloudflare Tunnel pour exposer ce port`);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. REJOINDRE LE SERVEUR PRIVÉ MM2
// ═════════════════════════════════════════════════════════════════════════════
// noblox.js ne peut pas téléporter un bot dans un jeu automatiquement.
// La méthode ci-dessous utilise l'API Roblox Game Join — elle génère un ticket
// de jeu que tu peux utiliser avec le launcher Roblox.
// Pour une automatisation complète, utilise un VPS avec Xvfb + Roblox Player.

async function getJoinTicket() {
  try {
    // Récupère l'ID du job (serveur privé) à partir du code
    const serverRes = await fetch(
      `https://games.roblox.com/v1/games/${PLACE_ID}/private-servers?privateServerKey=${PRIVATE_SERVER_CODE}`,
      {
        headers: {
          "Cookie": `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
        },
      }
    );

    if (!serverRes.ok) {
      console.error("[BOT] Impossible de récupérer le serveur privé:", serverRes.status);
      return null;
    }

    const serverData = await serverRes.json();
    const jobId = serverData?.privateServer?.serverStatus?.id;

    if (!jobId) {
      console.warn("[BOT] Serveur privé non trouvé ou vide (personne dedans)");
      return null;
    }

    console.log(`[BOT] 🎮 Job ID du serveur privé : ${jobId}`);

    // Génère un ticket de connexion
    const ticketRes = await fetch("https://auth.roblox.com/v1/authentication-ticket", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
        "Referer": "https://www.roblox.com",
        "Content-Type": "application/json",
      },
    });

    const ticket = ticketRes.headers.get("rbx-authentication-ticket");
    if (!ticket) {
      console.error("[BOT] Impossible d'obtenir le ticket d'auth");
      return null;
    }

    return { ticket, jobId };
  } catch (e) {
    console.error("[BOT] Erreur getJoinTicket:", e.message);
    return null;
  }
}

// Affiche le lien de join (à ouvrir manuellement ou via launcher automatisé)
async function printJoinLink() {
  const result = await getJoinTicket();
  if (!result) return;

  const { ticket, jobId } = result;
  const joinLink = `roblox://experiences/start?placeId=${PLACE_ID}&gameInstanceId=${jobId}&authenticationTicket=${ticket}`;

  console.log("\n[BOT] ══════════════════════════════════════════════");
  console.log("[BOT] 🎮 LIEN DE CONNEXION AU SERVEUR PRIVÉ :");
  console.log(`[BOT] ${joinLink}`);
  console.log("[BOT] ══════════════════════════════════════════════\n");
  console.log("[BOT] 💡 Copie ce lien dans ton navigateur sur la machine où Roblox est installé");
  console.log("[BOT] 💡 Sur VPS : utilise Xvfb + RobloxPlayerLauncher en headless");
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. CONNEXION NOBLOX.JS
// ═════════════════════════════════════════════════════════════════════════════
async function login() {
  try {
    await noblox.setCookie(ROBLOX_COOKIE);
    botUserId = await noblox.getIdFromCookie(ROBLOX_COOKIE);
    const info = await noblox.getPlayerInfo(botUserId);
    console.log(`[BOT] ✅ Connecté en tant que ${info.username} (${botUserId})`);

    // Vérifie que les trades sont activés
    console.log("[BOT] ⚠️  Assure-toi que le compte bot a TradePrivacy = 'All' sur roblox.com/settings");
  } catch (e) {
    console.error("[BOT] Erreur de connexion Roblox:", e.message);
    process.exit(1);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. SURVEILLANCE DES TRADES ENTRANTS
// ═════════════════════════════════════════════════════════════════════════════
// Quand un joueur est dans le serveur privé ET envoie un trade au bot,
// le bot scanne son inventaire puis décline le trade.

async function watchTrades() {
  console.log("[BOT] 👀 Surveillance des trades active...");

  setInterval(async () => {
    if (isProcessingTrade) return;

    try {
      const inbound = await noblox.getTrades("Inbound");
      if (!inbound || inbound.length === 0) return;

      for (const trade of inbound) {
        if (isProcessingTrade) break;
        isProcessingTrade = true;

        const initiatorId   = trade.user.id;
        const initiatorName = trade.user.name;

        // Vérifie si le joueur est dans le serveur privé
        // (optionnel : retire cette vérification si tu veux scanner tous les trades)
        const inServer = [...playersInServer].some(e => {
          const p = JSON.parse(e);
          return String(p.id) === String(initiatorId);
        });

        if (!inServer) {
          console.log(`[BOT] ⏭️  Trade de ${initiatorName} ignoré (pas dans le serveur privé)`);
          // On decline quand même pour ne pas laisser la file s'accumuler
          await noblox.declineTrade(trade.id).catch(() => {});
          isProcessingTrade = false;
          continue;
        }

        console.log(`[BOT] 🔄 Trade reçu de ${initiatorName} (${initiatorId}) — dans le serveur ✅`);

        // Scanne l'inventaire
        const items = await getMM2Inventory(initiatorId);

        if (items === null) {
          console.log(`[BOT] ⚠️  Inventaire privé pour ${initiatorName}`);
          await noblox.declineTrade(trade.id).catch(() => {});
          isProcessingTrade = false;
          continue;
        }

        console.log(`[BOT] 📦 ${items.length} items trouvés pour ${initiatorName}`);

        // Cherche l'userId du site
        const siteUserId = await getSiteUserIdByRoblox(initiatorName);
        if (siteUserId) {
          await postInventory(siteUserId, initiatorName, items);
        } else {
          await postInventory(`roblox_${initiatorName.toLowerCase()}`, initiatorName, items);
          console.log(`[BOT] ⚠️  Pas de compte site pour ${initiatorName}, stocké sous clé temporaire`);
        }

        // Décline le trade
        await noblox.declineTrade(trade.id).catch(() => {});
        console.log(`[BOT] ✅ Trade décliné après scan`);

        isProcessingTrade = false;
        await sleep(2000);
      }
    } catch (e) {
      if (!e.message?.includes("No trades") && !e.message?.includes("no trades")) {
        console.error("[BOT] Erreur watchTrades:", e.message);
      }
      isProcessingTrade = false;
    }
  }, SCAN_INTERVAL_MS);
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. HELPERS
// ═════════════════════════════════════════════════════════════════════════════
async function getMM2Inventory(userId) {
  const items = [];
  let cursor = "";
  let page = 0;
  const BASE = `https://inventory.roblox.com/v2/users/${userId}/inventory`;

  try {
    do {
      const url = `${BASE}?assetTypes=4&limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await fetch(url, {
        headers: {
          "Cookie": `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
          "User-Agent": "MM2Hub-Bot/2.0",
        },
      });

      if (res.status === 403) {
        console.warn(`[BOT] Inventaire privé pour userId ${userId}`);
        return null;
      }

      const data = await res.json();
      if (!data.data) break;

      for (const asset of data.data) {
        const name = asset.name || asset.assetName || "";
        if (!name) continue;
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
      if (page > 20) break;
      await sleep(500);
    } while (cursor);
  } catch (e) {
    console.error("[BOT] Erreur récupération inventaire:", e.message);
    return null;
  }

  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

function isKnownMM2Item(name) {
  const keywords = ["blade", "shard", "knife", "gun", "axe", "scythe", "shot",
                    "sword", "dagger", "wand", "cannon", "beam", "bringer"];
  return keywords.some(k => name.toLowerCase().includes(k));
}

function guessRarity(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("chroma")) return "Chroma";
  if (["elderwood scythe","hallowscythe","logchopper","icebreaker","swirly axe"]
      .some(n => lower.includes(n))) return "Ancient";
  return "Godly";
}

async function postInventory(userId, robloxUsername, items) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-secret": BOT_SECRET },
      body: JSON.stringify({ userId, robloxUsername, items, scannedAt: new Date().toISOString() }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[BOT] ✅ Inventaire envoyé : ${data.count} items pour ${robloxUsername}`);
    } else {
      console.error("[BOT] Erreur API:", data);
    }
  } catch (e) {
    console.error("[BOT] Erreur envoi inventaire:", e.message);
  }
}

async function getSiteUserIdByRoblox(robloxUsername) {
  try {
    const url = API_URL.replace("/inventory", `/user-by-roblox?username=${encodeURIComponent(robloxUsername)}`);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.userId || null;
  } catch { return null; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═════════════════════════════════════════════════════════════════════════════
// POINT D'ENTRÉE
// ═════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     MM2 Hub Bot v2.0 — Private Srv   ║");
  console.log("╚══════════════════════════════════════╝");

  // Démarre le serveur bridge (reçoit les notifications de BotBridge.lua)
  startBridgeServer();

  await login();

  // Affiche le lien pour rejoindre le serveur privé manuellement
  await printJoinLink();

  await watchTrades();

  setInterval(() => {
    console.log(`[BOT] 💓 Alive — ${new Date().toLocaleTimeString()} — ${playersInServer.size} joueur(s) dans le serveur`);
  }, 300000);
})();
