export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/trade.html?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/trade.html?error=no_code');
  }

  const CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI  = 'https://mm2-hub.vercel.app/api/auth/callback/roblox';

  // Roblox exige Basic Auth : base64(client_id:client_secret)
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  try {
    // 1. Échange le code contre un access token
    const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token error:', tokenRes.status, err);
      return res.redirect(`/trade.html?error=token_failed&detail=${encodeURIComponent(tokenRes.status)}`);
    }

    const tokenData   = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Récupère les infos du user
    const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return res.redirect('/trade.html?error=userinfo_failed');
    }

    const user = await userRes.json();
    // Roblox retourne : sub, name (username), nickname (displayName), picture (avatar URL)

    const params = new URLSearchParams({
      roblox_id:      user.sub        || '',
      roblox_user:    user.name       || user.preferred_username || '',
      roblox_display: user.nickname   || user.name || '',
      roblox_avatar:  user.picture    || '',
    });

    return res.redirect(`/trade.html?${params.toString()}`);

  } catch (err) {
    console.error('OAuth error:', err);
    return res.redirect('/trade.html?error=server_error');
  }
}
