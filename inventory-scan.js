// ── À coller dans index.html — remplace ou complète ton loadInventory() ──────
// Ce code est appelé quand le joueur clique "Scanner mon inventaire"

async function scanInventory() {
  const user = getCurrentUser(); // ta fonction existante qui retourne { id, robloxUser, ... }
  if (!user) return showToast("Connecte-toi d'abord", "error");

  const robloxUsername = user.robloxUser;
  if (!robloxUsername) return showToast("Lie ton compte Roblox d'abord (Étape 1)", "error");

  // UI — état chargement
  const btn = document.getElementById("scan-btn");
  const inventoryDiv = document.getElementById("inventory-items");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Scan en cours..."; }
  if (inventoryDiv) inventoryDiv.innerHTML = `<div class="scanning-msg">🔍 Scan de l'inventaire de ${robloxUsername}...</div>`;

  try {
    // 1. Déclenche le scan côté serveur
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        robloxUsername: robloxUsername,
      }),
    });

    const data = await res.json();

    if (res.status === 403) {
      // Inventaire privé
      if (inventoryDiv) inventoryDiv.innerHTML = `
        <div class="inventory-error">
          🔒 Ton inventaire Roblox est privé.<br>
          <a href="https://www.roblox.com/my/account#!/privacy" target="_blank">
            Rends-le public ici
          </a> puis réessaie.
        </div>`;
      return;
    }

    if (!res.ok) {
      if (inventoryDiv) inventoryDiv.innerHTML = `<div class="inventory-error">❌ ${data.error || "Erreur inconnue"}</div>`;
      return;
    }

    // 2. Affiche les items
    displayInventory(data.items || [], data.scannedAt, data.cached);

    // Toast succès
    const msg = data.cached
      ? `📦 Cache — ${data.items.length} items (scanné ${timeAgo(data.updatedAt)})`
      : `✅ ${data.items.length} items importés depuis Roblox !`;
    showToast(msg, "success");

  } catch (e) {
    console.error("Erreur scan:", e);
    if (inventoryDiv) inventoryDiv.innerHTML = `<div class="inventory-error">❌ Erreur réseau</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔍 Scanner mon inventaire"; }
  }
}

// ── Affichage des items ───────────────────────────────────────────────────────
function displayInventory(items, scannedAt, cached) {
  const inventoryDiv = document.getElementById("inventory-items");
  if (!inventoryDiv) return;

  if (!items || items.length === 0) {
    inventoryDiv.innerHTML = `<div class="inventory-empty">Aucun item MM2 trouvé dans cet inventaire.</div>`;
    return;
  }

  // Trie par valeur décroissante
  const sorted = [...items].sort((a, b) => (b.value || 0) - (a.value || 0));

  const totalValue = sorted.reduce((sum, i) => sum + (i.value || 0), 0);

  const rarityColors = {
    Chroma:  "#ff4fc3",
    Ancient: "#ff6b2b",
    Godly:   "#ffd700",
    Unique:  "#c084fc",
    Legendary: "#60a5fa",
    Vintage: "#34d399",
  };

  inventoryDiv.innerHTML = `
    <div class="inventory-header">
      <span>📦 ${items.length} items · Valeur totale : <b>${totalValue.toLocaleString()}</b></span>
      <span class="scan-time">${cached ? "🗄 Depuis le cache" : "🔄 Scanné"} · ${timeAgo(scannedAt)}</span>
    </div>
    <div class="inventory-grid">
      ${sorted.map(item => `
        <div class="item-card" data-rarity="${item.rarity || 'Godly'}">
          <div class="item-rarity" style="color:${rarityColors[item.rarity] || '#ffd700'}">
            ${item.rarity || "Godly"}
          </div>
          <div class="item-name">${item.name}</div>
          ${item.value ? `<div class="item-value">⚡ ${item.value.toLocaleString()}</div>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

// ── Charge l'inventaire depuis le cache au chargement de la page ─────────────
async function loadInventory() {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const res = await fetch(`/api/inventory?userId=${encodeURIComponent(user.id)}`);
    if (!res.ok) return; // Pas encore scanné — pas d'erreur visible
    const data = await res.json();
    if (data.items?.length > 0) {
      displayInventory(data.items, data.scannedAt, true);
    }
  } catch (e) {
    // Silencieux — l'inventaire n'a pas encore été scanné
  }
}

// ── Helper timeAgo ────────────────────────────────────────────────────────────
function timeAgo(isoDate) {
  if (!isoDate) return "?";
  const diff = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

// ── Branche le bouton ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scan-btn");
  if (btn) btn.addEventListener("click", scanInventory);

  // Charge le cache au démarrage
  loadInventory();
});
