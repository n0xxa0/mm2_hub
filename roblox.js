// api/auth/roblox.js
// Roblox doesn't have a standard OAuth for regular users.
// This endpoint validates a Roblox username via the public API and returns the user.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = "";
  await new Promise((resolve) => {
    req.on("data", (chunk) => (body += chunk));
    req.on("end", resolve);
  });

  const { username } = JSON.parse(body || "{}");
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username requis" });
  }

  try {
    // Use Roblox public API to look up the user
    const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: true }),
    });

    const data = await lookupRes.json();

    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: "Utilisateur Roblox introuvable" });
    }

    const robloxUser = data.data[0];

    // Get avatar thumbnail
    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxUser.id}&size=48x48&format=Png&isCircular=false`
    );
    const thumbData = await thumbRes.json();
    const avatar =
      thumbData.data && thumbData.data[0] ? thumbData.data[0].imageUrl : null;

    return res.status(200).json({
      id: String(robloxUser.id),
      username: robloxUser.name,
      displayName: robloxUser.displayName,
      avatar,
      provider: "Roblox",
    });
  } catch (err) {
    console.error("Roblox lookup error:", err);
    return res.status(500).json({ error: "Erreur de vérification Roblox" });
  }
}
