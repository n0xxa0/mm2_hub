export default async function handler(req, res) {
  const url   = new URL(req.url, `https://${req.headers.host}`);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const BASE  = 'https://mm2-hub.vercel.app';

  const redirect = (location) => {
    res.writeHead(302, { Location: location });
    res.end();
  };

  if (error) return redirect(`${BASE}/trade.html?error=${encodeURIComponent(error)}`);
  if (!code)  return redirect(`${BASE}/trade.html?error=no_code`);

  const CLIENT_ID     = process.env.ROBLOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
  const REDIRECT_URI  = `${BASE}/api/auth/callback/roblox`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing ROBLOX_CLIENT_ID or ROBLOX_CLIENT_SECRET env vars');
    return redirect(`${BASE}/trade.html?error=server_misconfigured`);
  }

  console.log('CLIENT_ID:', CLIENT_ID);
  console.log('code length:', code?.length);

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

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
    return redirect(`${BASE}/trade.html?error=fetch_failed`);
  }

  const rawText = await tokenRes.text();
  console.log('Token response:', tokenRes.status, rawText.slice(0, 300));

  if (!tokenRes.ok) {
    return redirect(`${BASE}/trade.html?error=token_${tokenRes.status}`);
  }

  let tokenData;
  try {
    tokenData = JSON.parse(rawText);
  } catch (parseErr) {
    console.error('Token JSON parse failed:', parseErr.message);
    return redirect(`${BASE}/trade.html?error=token_parse_failed`);
  }

  const accessToken = tokenData.access_token;

  if (!accessToken) {
    console.error('No access_token in token response');
    return redirect(`${BASE}/trade.html?error=no_access_token`);
  }

  console.log('Sending userinfo request...');

  let userRes;
  try {
    userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept':        'application/json',
        'User-Agent':    'mm2-hub-oauth/1.0',
      },
    });
  } catch (err) {
    console.error('userinfo fetch threw:', err.message);
    return redirect(`${BASE}/trade.html?error=userinfo_fetch_failed`);
  }

  console.log('Userinfo status:', userRes.status);

  const userRawText = await userRes.text();
  console.log('Userinfo response:', userRawText.slice(0, 300));

  if (!userRes.ok) {
    return redirect(`${BASE}/trade.html?error=userinfo_${userRes.status}`);
  }

  let user;
  try {
    user = JSON.parse(userRawText);
  } catch (parseErr) {
    console.error('Userinfo JSON parse failed:', parseErr.message);
    return redirect(`${BASE}/trade.html?error=userinfo_parse_failed`);
  }

  const params = new URLSearchParams({
    roblox_id:      user.sub      || '',
    roblox_user:    user.name     || user.preferred_username || '',
    roblox_display: user.nickname || user.name || '',
    roblox_avatar:  user.picture  || '',
  });

  console.log('Redirecting with params:', params.toString());

  return redirect(`${BASE}/trade.html?${params.toString()}`);
}