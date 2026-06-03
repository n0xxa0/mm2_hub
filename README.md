# MM2 Hub — Setup & Déploiement

## Structure du projet

```
mm2hub/
├── api/
│   └── values.js        ← Serverless function Vercel (scrape supremevalues.com)
├── public/
│   └── index.html       ← Front-end
├── package.json
├── vercel.json
└── README.md
```

## Déploiement (5 minutes)

### 1. Push sur GitHub
```bash
git init
git add .
git commit -m "init mm2hub"
git remote add origin https://github.com/TON_USERNAME/mm2hub.git
git push -u origin main
```

### 2. Importer sur Vercel
1. Va sur [vercel.com](https://vercel.com) → **Add New Project**
2. Sélectionne ton repo GitHub `mm2hub`
3. Laisse tous les paramètres par défaut
4. Clique **Deploy**

Vercel détecte automatiquement le `vercel.json` et installe `cheerio`.

### 3. Tester l'API
Une fois déployé, ouvre :
```
https://TON-PROJET.vercel.app/api/values
```
Tu dois voir un JSON avec `items: [...]`.

## Comment ça marche

- `GET /api/values` → scrape supremevalues.com, retourne tous les items en JSON, cache 30 min
- `GET /api/values?refresh=1` → force un re-scrape immédiat
- Le front `index.html` appelle `/api/values` au même domaine → pas de problème CORS

## Si le scraper ne trouve pas les items

supremevalues.com peut changer sa structure HTML. Dans ce cas :
1. Ouvre supremevalues.com/mm2/godlies dans ton navigateur
2. Fais **Inspecter** → regarde la classe CSS des cartes d'items
3. Mets à jour les sélecteurs dans `api/values.js` (ligne ~40) :
   ```js
   $(".TA_CLASSE_ICI").each((_, el) => { ... })
   ```
