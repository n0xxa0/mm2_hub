# MM2 Hub — Guide de déploiement Vercel

## Structure du projet

```
mm2hub/
├── index.html              ← Application frontend complète
├── vercel.json             ← Config Vercel (routing)
├── .env.example            ← Variables d'environnement à renseigner
└── api/
    └── auth/
        ├── google.js               ← Initie la connexion Google
        ├── discord.js              ← Initie la connexion Discord
        ├── roblox.js               ← Valide un pseudo Roblox (POST)
        └── callback/
            ├── google.js           ← Callback Google OAuth
            └── discord.js          ← Callback Discord OAuth
```

---

## Déploiement sur Vercel (via GitHub)

### 1. Pusher le projet sur GitHub

```bash
git init
git add .
git commit -m "MM2 Hub v3 — OAuth réel"
git branch -M main
git remote add origin https://github.com/TON_PSEUDO/mm2hub.git
git push -u origin main
```

### 2. Importer sur Vercel

1. Va sur [vercel.com](https://vercel.com) → **New Project**
2. Importe ton dépôt GitHub `mm2hub`
3. Laisse les paramètres par défaut (Vercel détecte un projet statique + serverless)
4. Clique **Deploy** (premier déploiement sans OAuth, c'est normal)

### 3. Configurer les variables d'environnement

Dans Vercel → **Settings → Environment Variables**, ajoute :

| Nom | Valeur |
|-----|--------|
| `BASE_URL` | `https://ton-projet.vercel.app` |
| `GOOGLE_CLIENT_ID` | *(voir ci-dessous)* |
| `GOOGLE_CLIENT_SECRET` | *(voir ci-dessous)* |
| `DISCORD_CLIENT_ID` | *(voir ci-dessous)* |
| `DISCORD_CLIENT_SECRET` | *(voir ci-dessous)* |

---

## Obtenir les clés OAuth

### Google
1. Va sur [console.cloud.google.com](https://console.cloud.google.com/apis/credentials)
2. **Créer des identifiants → ID client OAuth 2.0 → Application Web**
3. Ajoute dans **URI de redirection autorisés** :
   ```
   https://ton-projet.vercel.app/api/auth/callback/google
   ```
4. Copie le **Client ID** et le **Client Secret**

### Discord
1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → OAuth2 → Redirects → Ajoute :
   ```
   https://ton-projet.vercel.app/api/auth/callback/discord
   ```
3. Copie le **Client ID** et le **Client Secret**

### Roblox
Aucune clé nécessaire — l'API publique Roblox est utilisée pour valider les pseudos.

---

## Développement local

```bash
npm i -g vercel
vercel dev
```

Crée un fichier `.env.local` (copie de `.env.example`) avec `BASE_URL=http://localhost:3000`.

---

## Comment ça marche

```
Utilisateur clique "Google"
  → /api/auth/google          (redirige vers accounts.google.com)
  → Google demande l'autorisation
  → /api/auth/callback/google (échange le code, récupère le profil)
  → Redirige vers /?oauth_user=...
  → index.html lit le paramètre, appelle handleOAuthUser()
  → Stocké dans localStorage, session démarrée
```

Pour Roblox, c'est un appel API direct (POST `/api/auth/roblox`) sans redirection.
