// api/auth/callback/roblox.js
// Vercel serverless — reçoit le code OAuth Roblox, échange contre un token,
// récupère le vrai pseudo + avatar, puis redirige vers trade.html

export default async function handler(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/trade.html?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect("/trade.html?error=no_code");
  }

  const CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.ROBLOX_REDIRECT_URI || "https://mm2-hub.vercel.app/api/auth/callback/roblox";

  try {
    // ── 1. Échanger le code contre un access token ──
    const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange failed:", err);
      return res.redirect("/trade.html?error=token_failed");
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // ── 2. Récupérer les infos utilisateur (openid + profile) ──
    const userInfoRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      return res.redirect("/trade.html?error=userinfo_failed");
    }

    const userInfo = await userInfoRes.json();
    // userInfo contient : sub (= userId), name, preferred_username, profile, picture

    const robloxId      = userInfo.sub;
    const robloxName    = userInfo.preferred_username || userInfo.name || "Joueur";
    const displayName   = userInfo.name || robloxName;

    // ── 3. Récupérer l'avatar headshot depuis l'API Roblox ──
    let avatarUrl = userInfo.picture || null;

    if (!avatarUrl && robloxId) {
      try {
        const avatarRes = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`
        );
        if (avatarRes.ok) {
          const avatarData = await avatarRes.json();
          avatarUrl = avatarData?.data?.[0]?.imageUrl || null;
        }
      } catch (e) {
        console.warn("Avatar fetch failed:", e);
      }
    }

    // ── 4. Rediriger vers trade.html avec les infos en query params ──
    const params = new URLSearchParams({
      roblox_user:    robloxName,
      roblox_display: displayName,
      roblox_id:      robloxId,
    });
    if (avatarUrl) params.set("roblox_avatar", avatarUrl);

    return res.redirect(`/trade.html?${params.toString()}`);

  } catch (e) {
    console.error("OAuth callback error:", e);
    return res.redirect("/trade.html?error=server_error");
  }
}
