// api/auth/callback/roblox.js
// Reçoit le code Roblox, échange contre un token, récupère le profil
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);

  const clientId = process.env.ROBLOX_CLIENT_ID;
  const clientSecret = process.env.ROBLOX_CLIENT_SECRET;
  const redirectUri = `${process.env.BASE_URL}/api/auth/callback/roblox`;

  try {
    // 1. Échanger le code contre un access token
    const tokenRes = await fetch("https://apis.roblox.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("No access token");

    // 2. Récupérer le profil Roblox
    const profileRes = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    // 3. Récupérer l'avatar headshot
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${profile.sub}&size=48x48&format=Png&isCircular=false`
    );
    const thumbData = await thumbRes.json();
    const avatar = thumbData.data?.[0]?.imageUrl ?? null;

    const user = {
      id: profile.sub,
      username: profile.preferred_username ?? profile.name,
      email: null,
      avatar,
      provider: "Roblox",
    };

    res.redirect(`/?oauth_user=${encodeURIComponent(JSON.stringify(user))}`);
  } catch (err) {
    console.error("Roblox OAuth error:", err);
    res.redirect(`/?auth_error=${encodeURIComponent("Erreur d'authentification Roblox")}`);
  }
}
