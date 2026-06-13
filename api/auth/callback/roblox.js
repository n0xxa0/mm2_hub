export default async function handler(req) {
  const url   = new URL(req.url);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const BASE  = 'https://mm2-hub.vercel.app';

  if (error) return Response.redirect(`${BASE}/trade.html?error=${encodeURIComponent(error)}`);
  if (!code)  return Response.redirect(`${BASE}/trade.html?error=no_code`);

  const CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI  = `${BASE}/api/auth/callback/roblox`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing ROBLOX_CLIENT_ID or ROBLOX_CLIENT_SECRET env vars');
    return Response.redirect(`${BASE}/trade.html?error=server_misconfigured`);
  }

  console.log('CLIENT_ID:', CLIENT_ID);
  console.log('code length:', code?.length);

  const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);

  const body = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  }).toString();

  console.log('Sending token request...');

  let tokenRes;
  try {
    tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
        'Accept':        'application/json',
        'User-Agent':    'mm2-hub-oauth/1.0',
      },
      body,
    });
  } catch (fetchErr) {
    console.error('fetch threw:', fetchErr.message);
    return Response.redirect(`${BASE}/trade.html?error=fetch_failed`);
  }

  const rawText = await tokenRes.text();
  console.log('Token response:', tokenRes.status, rawText.slice(0, 300));

  if (!tokenRes.ok) {
    return Response.redirect(`${BASE}/trade.html?error=token_${tokenRes.status}`);
  }

  const tokenData   = JSON.parse(rawText);
  const accessToken = tokenData.access_token;

  const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept':        'application/json',
      'User-Agent':    'mm2-hub-oauth/1.0',
    },
  });

  if (!userRes.ok) {
    console.error('Userinfo error:', userRes.status);
    return Response.redirect(`${BASE}/trade.html?error=userinfo_${userRes.status}`);
  }

  const user = await userRes.json();

  const params = new URLSearchParams({
    roblox_id:      user.sub      || '',
    roblox_user:    user.name     || user.preferred_username || '',
    roblox_display: user.nickname || user.name || '',
    roblox_avatar:  user.picture  || '',
  });

  return Response.redirect(`${BASE}/trade.html?${params.toString()}`);
}