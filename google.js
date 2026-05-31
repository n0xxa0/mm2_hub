// api/auth/callback/google.js
// Handles the redirect from Google, exchanges code for tokens, returns user info
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.BASE_URL}/api/auth/callback/google`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("No access token");

    // Get user profile
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    // Build user object and pass to frontend via redirect with encoded data
    const user = {
      id: profile.id,
      username: profile.name,
      email: profile.email,
      avatar: profile.picture,
      provider: "Google",
    };

    const encoded = encodeURIComponent(JSON.stringify(user));
    res.redirect(`/?oauth_user=${encoded}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect(`/?auth_error=${encodeURIComponent("Erreur d'authentification Google")}`);
  }
}
