// api/values.js — Vercel Serverless Function
// Scrape supremevalues.com and return all MM2 items as JSON
// Cache 30 minutes in memory (Vercel warm instances)

import * as cheerio from "cheerio";

// ─── In-memory cache ───────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// ─── Pages to scrape ──────────────────────────────────────────
const PAGES = [
  { url: "https://supremevalues.com/mm2/chromas",    rarity: "Chroma"    },
  { url: "https://supremevalues.com/mm2/ancients",   rarity: "Ancient"   },
  { url: "https://supremevalues.com/mm2/godlies",    rarity: "Godly"     },
  { url: "https://supremevalues.com/mm2/vintages",   rarity: "Vintage"   },
  { url: "https://supremevalues.com/mm2/legendaries",rarity: "Legendary" },
  { url: "https://supremevalues.com/mm2/rares",      rarity: "Rare"      },
  { url: "https://supremevalues.com/mm2/uncommons",  rarity: "Uncommon"  },
  { url: "https://supremevalues.com/mm2/commons",    rarity: "Common"    },
];

// ─── Scrape one page ──────────────────────────────────────────
async function scrapePage(url, rarity) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MM2Hub/1.0)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];

  // supremevalues.com item structure — each item is a card/row
  // Selectors based on their current markup (class names may vary)
  $(".item-card, .value-item, [class*='item'], tr.item").each((_, el) => {
    const $el = $(el);

    // Name
    const name = $el.find("[class*='name'], .item-name, td.name").first().text().trim();
    if (!name) return;

    // Value — can be like "1,234" or "1234"
    const rawVal = $el.find("[class*='value'], .item-value, td.value").first().text()
      .replace(/[^0-9.]/g, "");
    const value = parseFloat(rawVal) || 0;

    // Demand (1-10)
    const rawDemand = $el.find("[class*='demand'], td.demand").first().text()
      .replace(/[^0-9]/g, "");
    const demand = parseInt(rawDemand) || 5;

    // Stability
    const stab = $el.find("[class*='stability'], [class*='stab'], td.stability").first()
      .text().trim() || "Stable";

    // Last change
    const rawLc = $el.find("[class*='change'], [class*='last'], td.change").first()
      .text().replace(/[^0-9.\-+]/g, "");
    const lc = parseFloat(rawLc) || 0;

    // Range value — "[1000 - 1200]" or similar
    const rangeRaw = $el.find("[class*='range'], td.range").first().text();
    const rangeMatch = rangeRaw.match(/([\d,]+)\s*[-–]\s*([\d,]+)/);
    const range = rangeMatch
      ? [parseInt(rangeMatch[1].replace(/,/g, "")), parseInt(rangeMatch[2].replace(/,/g, ""))]
      : null;

    // Origin / event
    const origin = $el.find("[class*='origin'], [class*='event'], td.origin").first()
      .text().trim() || "";

    // Type: Gun or Knife — try to infer from class or data attribute
    const elClass = ($el.attr("class") || "").toLowerCase();
    const elData = ($el.attr("data-type") || $el.attr("data-weapon") || "").toLowerCase();
    let type = "K";
    if (elData.includes("gun") || elClass.includes("gun")) type = "G";
    else if (elData.includes("knife") || elClass.includes("knife")) type = "K";

    // Image
    const img = $el.find("img").first().attr("src") || "";

    items.push({ name, value, rarity, type, demand, stab, lc, range, origin, img });
  });

  return items;
}

// ─── Fallback: parse any JSON embedded in page scripts ─────────
async function scrapeViaScript(url, rarity) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MM2Hub/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Look for inline JSON arrays like window.__DATA__ = [...] or similar
  const jsonMatch = html.match(/(?:window\.__(?:DATA|ITEMS|VALUES)__|var\s+(?:items|data|values))\s*=\s*(\[[\s\S]*?\]);/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[1]);
      return arr.map(i => ({ ...i, rarity }));
    } catch { /* ignore */ }
  }
  return [];
}

// ─── Main fetch (all pages in parallel) ───────────────────────
async function fetchAllItems() {
  const results = await Promise.allSettled(
    PAGES.map(async ({ url, rarity }) => {
      let items = await scrapePage(url, rarity);
      if (!items.length) items = await scrapeViaScript(url, rarity);
      return items;
    })
  );

  const all = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}

// ─── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

  const forceRefresh = req.query.refresh === "1";
  const now = Date.now();

  // Serve from cache if valid
  if (!forceRefresh && _cache && now - _cacheAt < CACHE_TTL) {
    return res.json({
      items: _cache,
      total: _cache.length,
      cached: true,
      cachedAt: new Date(_cacheAt).toISOString(),
    });
  }

  try {
    const items = await fetchAllItems();

    if (!items.length) {
      return res.status(502).json({ error: "No items scraped — site structure may have changed" });
    }

    _cache = items;
    _cacheAt = now;

    return res.json({
      items,
      total: items.length,
      cached: false,
      cachedAt: new Date(now).toISOString(),
    });

  } catch (err) {
    console.error("[api/values] Error:", err);

    // Return stale cache if available
    if (_cache) {
      return res.json({
        items: _cache,
        total: _cache.length,
        cached: true,
        stale: true,
        cachedAt: new Date(_cacheAt).toISOString(),
        warning: err.message,
      });
    }

    return res.status(500).json({ error: err.message });
  }
}
