// api/values.js — Vercel Serverless Function
// Scrape supremevalues.com via regex sur le HTML brut (pas de cheerio nécessaire)

let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

const PAGES = [
  { url: "https://supremevalues.com/mm2/chromas",     rarity: "Chroma"    },
  { url: "https://supremevalues.com/mm2/ancients",    rarity: "Ancient"   },
  { url: "https://supremevalues.com/mm2/godlies",     rarity: "Godly"     },
  { url: "https://supremevalues.com/mm2/vintages",    rarity: "Vintage"   },
  { url: "https://supremevalues.com/mm2/legendaries", rarity: "Legendary" },
  { url: "https://supremevalues.com/mm2/rares",       rarity: "Rare"      },
  { url: "https://supremevalues.com/mm2/uncommons",   rarity: "Uncommon"  },
  { url: "https://supremevalues.com/mm2/commons",     rarity: "Common"    },
];

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseNum(str) {
  const n = parseFloat((str || "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// Detect knife vs gun from image path or name
function inferType(name, imgSrc) {
  const combined = ((name || "") + (imgSrc || "")).toLowerCase();
  const gunWords = ["gun","pistol","revolver","rifle","blaster","cannon","shooter","raygun","beam","sniper","shotgun"];
  for (const w of gunWords) if (combined.includes(w)) return "G";
  return "K";
}

async function scrapePage(url, rarity) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  const items = [];

  // Each item is in a <tr> containing an image and a cell with all the text info
  // Split on <tr> boundaries
  const rows = html.split(/<tr[\s>]/i);

  for (const row of rows) {
    // Must contain "Value -" to be an item row
    if (!row.includes("Value -") && !row.includes("Value -")) continue;

    // --- Name: first bold text after a heading-like position, before "Value -"
    // The name appears as plain text followed by the value line
    const nameMatch = row.match(/>\s*([A-Za-z0-9][^<\n]{1,60}?)\s*(?:<img[^>]*experimental|<br)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].replace(/[^\w\s'''\-\.]/g, "").trim();
    if (!name || name.length < 2) continue;

    // --- Value
    const valMatch = row.match(/Value\s*-\s*<b>([\d,]+)<\/b>/i);
    if (!valMatch) continue;
    const value = parseNum(valMatch[1]);

    // --- Ranged value
    let range = null;
    const rangeMatch = row.match(/Ranged Value\s*-\s*\[<b>([\d,]+)\s*-\s*([\d,]+)<\/b>\]/i);
    if (rangeMatch) range = [parseNum(rangeMatch[1]), parseNum(rangeMatch[2])];

    // --- Stability
    const stabMatch = row.match(/Stability\s*-\s*<b>([^<]+)<\/b>/i);
    const stab = stabMatch ? stabMatch[1].trim() : "Stable";

    // --- Demand
    const demandMatch = row.match(/Demand\s*-\s*<b>(\d+)<\/b>/i);
    const demand = demandMatch ? parseInt(demandMatch[1]) : 5;

    // --- Origin
    const originMatch = row.match(/Origin\s*-\s*([^<\n]+?)(?:<|Last Change|\n)/i);
    const origin = originMatch ? stripHtml(originMatch[1]).trim() : "";

    // --- Last change
    const lcMatch = row.match(/Last Change[^(]*\(\s*([+\-]?[\d,]+)\s*\)/i);
    const lc = lcMatch ? parseNum(lcMatch[1].replace(/,/g, "")) : 0;

    // --- Image URL
    const imgMatch = row.match(/<img[^>]+src="([^"]+supremevalues[^"]+)"/i);
    const img = imgMatch ? imgMatch[1] : "";

    // --- Type
    const type = inferType(name, img);

    items.push({ name, value, rarity, type, demand, stab, lc, range, origin, img });
  }

  return items;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  const forceRefresh = req.query.refresh === "1";
  const now = Date.now();

  if (!forceRefresh && _cache && now - _cacheAt < CACHE_TTL) {
    return res.json({ items: _cache, total: _cache.length, cached: true, cachedAt: new Date(_cacheAt).toISOString() });
  }

  try {
    const results = await Promise.allSettled(
      PAGES.map(({ url, rarity }) => scrapePage(url, rarity))
    );

    const all = [];
    const errors = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") all.push(...results[i].value);
      else errors.push(`${PAGES[i].rarity}: ${results[i].reason?.message}`);
    }

    if (!all.length) {
      return res.status(502).json({ error: "No items scraped", errors });
    }

    _cache = all;
    _cacheAt = now;
    return res.json({ items: all, total: all.length, cached: false, cachedAt: new Date(now).toISOString(), errors: errors.length ? errors : undefined });

  } catch (err) {
    if (_cache) {
      return res.json({ items: _cache, total: _cache.length, cached: true, stale: true, cachedAt: new Date(_cacheAt).toISOString(), warning: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
}
