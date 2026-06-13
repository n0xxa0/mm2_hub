// api/conversations.js  — GET /api/conversations?userId=XXX  |  POST /api/conversations
// Stockage : Vercel KV

import { kv } from "@vercel/kv";

async function getConvo(id) {
  return kv.get(`convo:${id}`);
}
async function saveConvo(convo) {
  await kv.set(`convo:${convo.id}`, convo);
}
async function getUserConvoIds(userId) {
  return (await kv.get(`user_convos:${userId}`)) || [];
}
async function addUserConvoId(userId, convoId) {
  const ids = await getUserConvoIds(userId);
  if (!ids.includes(convoId)) {
    ids.push(convoId);
    await kv.set(`user_convos:${userId}`, ids);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── GET : conversations d'un utilisateur ──
  if (req.method === "GET") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const ids  = await getUserConvoIds(userId);
    const convos = (await Promise.all(ids.map(id => getConvo(id)))).filter(Boolean);
    return res.json({ conversations: convos });
  }

  // ── POST : démarrer ou envoyer un message ──
  if (req.method === "POST") {
    const { action } = req.body;

    // -- start : créer ou retrouver une conversation liée à une annonce --
    if (action === "start") {
      const { adId, adLabel, userId, otherUserId } = req.body;
      if (!userId || !otherUserId) return res.status(400).json({ error: "userId and otherUserId required" });

      // Chercher une convo existante entre ces deux users pour cette annonce
      const userIds = await getUserConvoIds(userId);
      let existing = null;
      for (const cid of userIds) {
        const c = await getConvo(cid);
        if (c && c.adId === adId && c.participants.includes(otherUserId)) {
          existing = c;
          break;
        }
      }
      if (existing) return res.json({ conversation: existing });

      const id    = `c_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const convo = { id, adId, adLabel, participants: [userId, otherUserId], messages: [], createdAt: Date.now() };
      await saveConvo(convo);
      await addUserConvoId(userId, id);
      await addUserConvoId(otherUserId, id);
      return res.json({ conversation: convo });
    }

    // -- message : envoyer un message dans une convo existante --
    if (action === "message") {
      const { convoId, from, text } = req.body;
      if (!convoId || !from || !text) return res.status(400).json({ error: "convoId, from, text required" });

      const convo = await getConvo(convoId);
      if (!convo) return res.status(404).json({ error: "conversation not found" });
      if (!convo.participants.includes(from)) return res.status(403).json({ error: "forbidden" });

      convo.messages.push({ from, text, ts: Date.now() });
      // Garder max 200 messages par convo
      if (convo.messages.length > 200) convo.messages.splice(0, convo.messages.length - 200);
      await saveConvo(convo);
      return res.json({ conversation: convo });
    }

    return res.status(400).json({ error: "unknown action" });
  }

  res.status(405).json({ error: "method not allowed" });
}
