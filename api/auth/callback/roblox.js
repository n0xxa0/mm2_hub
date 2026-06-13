export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect('/?error=no_code');
  }

  const CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI  = 'https://mm2-hub.vercel.app/api/auth/callback/roblox';

  try {
    // 1. Échange le code contre un access token
    const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token error:', err);
      return res.redirect('/trade.html?error=token_failed');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Récupère les infos du user
    const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return res.redirect('/trade.html?error=userinfo_failed');
    }

    const user = await userRes.json();
    // user contient : sub (id), name, nickname, profile, picture...

    const userId       = user.sub;
    const username     = user.name || user.preferred_username || user.nickname;
    const displayName  = user.nickname || username;
    const avatarUrl    = user.picture || '';

    // 3. Redirige vers trade.html avec les infos en query string
    const params = new URLSearchParams({
      roblox_id:      userId,
      roblox_user:    username,
      roblox_display: displayName,
      roblox_avatar:  avatarUrl,
    });

    return res.redirect(`/trade.html?${params.toString()}`);

  } catch (err) {
    console.error('OAuth error:', err);
    return res.redirect('/trade.html?error=server_error');
  }
}
