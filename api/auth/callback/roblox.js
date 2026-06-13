export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url    = new URL(req.url);
  const code   = url.searchParams.get('code');
  const error  = url.searchParams.get('error');

  const BASE = 'https://mm2-hub.vercel.app';

  if (error) {
    return Response.redirect(`${BASE}/trade.html?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return Response.redirect(`${BASE}/trade.html?error=no_code`);
  }

  const CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI  = `${BASE}/api/auth/callback/roblox`;

  const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

  try {
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
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token error:', tokenRes.status, err);
      return Response.redirect(`${BASE}/trade.html?error=token_failed&detail=${tokenRes.status}`);
    }

    const tokenData   = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      return Response.redirect(`${BASE}/trade.html?error=userinfo_failed`);
    }

    const user = await userRes.json();

    const params = new URLSearchParams({
      roblox_id:      user.sub      || '',
      roblox_user:    user.name     || user.preferred_username || '',
      roblox_display: user.nickname || user.name || '',
      roblox_avatar:  user.picture  || '',
    });

    return Response.redirect(`${BASE}/trade.html?${params.toString()}`);

  } catch (err) {
    console.error('OAuth error:', err.message);
    return Response.redirect(`${BASE}/trade.html?error=server_error`);
  }
}
