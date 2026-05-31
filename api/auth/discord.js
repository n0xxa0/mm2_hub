// api/auth/discord.js
// Redirects user to Discord OAuth consent screen
export default function handler(req, res) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = `${process.env.BASE_URL}/api/auth/callback/discord`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
