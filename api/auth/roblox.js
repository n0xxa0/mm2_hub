// api/auth/roblox.js
// Redirige vers Roblox OAuth consent screen
export default function handler(req, res) {
  const clientId = process.env.ROBLOX_CLIENT_ID;
  const redirectUri = `${process.env.BASE_URL}/api/auth/callback/roblox`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state: Math.random().toString(36).slice(2),
  });

  res.redirect(`https://apis.roblox.com/oauth/v1/authorize?${params}`);
}
