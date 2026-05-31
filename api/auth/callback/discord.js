// api/auth/callback/discord.js
// Handles Discord OAuth redirect
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = `${process.env.BASE_URL}/api/auth/callback/discord`;

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
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

    // Get Discord user profile
    const profileRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    const avatarUrl = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null;

    const user = {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      avatar: avatarUrl,
      provider: "Discord",
    };

    const encoded = encodeURIComponent(JSON.stringify(user));
    res.redirect(`/?oauth_user=${encoded}`);
  } catch (err) {
    console.error("Discord OAuth error:", err);
    res.redirect(`/?auth_error=${encodeURIComponent("Erreur d'authentification Discord")}`);
  }
}
