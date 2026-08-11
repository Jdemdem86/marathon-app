# 🏃 App Marathon — installation

Une seule installation. Ensuite, **plus jamais de manipulation** : chaque mise à jour se déploie toute seule.

---

## Ce que tu vas mettre en place

| Quoi | Pourquoi | Coût |
|---|---|---|
| **GitHub Pages** | héberge l'app, avec déploiement automatique | gratuit |
| **Cloudflare Workers** | garde tes clés secrètes en sécurité | gratuit (100 000 requêtes/jour) |
| **Clé API Anthropic** | l'analyse de tes séances | ~0,50 € pour tout ton plan |
| **Appli Strava** | récupération automatique de tes sorties | gratuit |

⏱️ Compte 30-40 minutes pour tout mettre en place, une seule fois.

---

## Étape 1 — Créer le dépôt GitHub

1. Sur [github.com](https://github.com) → **+** en haut à droite → **New repository**
2. Nom : `marathon-app` (si tu choisis un autre nom, note-le, il servira à l'étape 6)
3. **Public**, puis **Create repository**
4. Envoie tous les fichiers de ce projet dans le dépôt :
   - Le plus simple : **Add file → Upload files**, glisse tout le contenu du dossier, puis **Commit changes**
   - ⚠️ Le dossier `.github` est parfois masqué par ton explorateur de fichiers — vérifie qu'il est bien envoyé, c'est lui qui fait la magie du déploiement automatique

---

## Étape 2 — Obtenir ta clé API Anthropic

1. Va sur [console.anthropic.com](https://console.anthropic.com) → connecte-toi
2. **Billing** → ajoute un petit crédit (5 € suffisent largement pour tout ton plan)
3. **API Keys** → **Create Key** → copie la clé (elle commence par `sk-ant-…`)
4. ⚠️ Garde-la de côté un instant, tu ne pourras plus la revoir après avoir fermé la fenêtre — et **ne la partage jamais**, pas même avec moi dans une conversation

---

## Étape 3 — Créer ton appli Strava

1. Va sur [strava.com/settings/api](https://www.strava.com/settings/api)
2. Remplis le formulaire :
   - **Application Name** : `Mon Plan Marathon`
   - **Category** : `Training`
   - **Website** : l'adresse de ton dépôt GitHub
   - **Authorization Callback Domain** : `workers.dev` *(on l'ajustera à l'étape 5 si besoin)*
3. Note le **Client ID** et le **Client Secret**

---

## Étape 4 — Déployer le service (Cloudflare)

1. Crée un compte gratuit sur [dash.cloudflare.com](https://dash.cloudflare.com)
2. Sur ton ordinateur, ouvre un terminal dans le dossier `worker/` du projet, puis :

```bash
npx wrangler login
```

3. Crée l'espace de stockage pour le jeton Strava :

```bash
npx wrangler kv namespace create TOKENS
```

Ça affiche un identifiant. **Copie-le dans `wrangler.toml`** à la place de `REMPLACER_PAR_TON_ID_KV`.

4. Enregistre tes secrets (ils ne sont jamais écrits dans le code) :

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put STRAVA_CLIENT_ID
npx wrangler secret put STRAVA_CLIENT_SECRET
```

5. Déploie :

```bash
npx wrangler deploy
```

Note l'adresse affichée, du type `https://marathon-api.TON-COMPTE.workers.dev`

---

## Étape 5 — Relier les morceaux

1. **Dans `worker/wrangler.toml`** : remplace `APP_ORIGIN` par l'adresse de ton app :
   `https://TON-PSEUDO.github.io/marathon-app/`
   Puis redéploie : `npx wrangler deploy`

2. **Sur [strava.com/settings/api](https://www.strava.com/settings/api)** : mets **Authorization Callback Domain** à ton domaine Cloudflare, sans le `https://` :
   `marathon-api.TON-COMPTE.workers.dev`

---

## Étape 6 — Activer le déploiement automatique

1. Dans ton dépôt GitHub → **Settings** → **Pages**
   → Source : **GitHub Actions**

2. **Settings** → **Secrets and variables** → **Actions** → onglet **Variables** → **New repository variable** :

| Nom | Valeur |
|---|---|
| `VITE_API_BASE` | `https://marathon-api.TON-COMPTE.workers.dev` |
| `VITE_BASE` | `/marathon-app/` *(le nom de ton dépôt, entre deux slashes)* |

3. Onglet **Actions** → lance le workflow **Build & Deploy** (bouton **Run workflow**)
4. Après ~2 minutes, ton app est en ligne à `https://TON-PSEUDO.github.io/marathon-app/`

---

## Étape 7 — Installer sur ton téléphone

1. Ouvre l'adresse `github.io` dans Chrome
2. **⋮** → **Ajouter à l'écran d'accueil**
3. **C'est la dernière fois que tu fais cette manipulation.**

Au premier clic sur « Récupérer ma dernière sortie Strava », l'app te proposera d'autoriser Strava — une seule fois, ensuite c'est automatique.

---

## 🎉 Et après ?

Pour chaque mise à jour, je pousse le nouveau code sur GitHub. Le déploiement se fait tout seul en ~2 minutes, et ton icône affiche la nouvelle version.

**Plus de publication, plus de vidage de cache, plus d'export/import.** Les noms de fichiers générés changent à chaque modification (`index.a1b2c3.js`), ce qui rend techniquement impossible l'affichage d'une vieille version en cache — c'était exactement le problème qu'on n'arrivait pas à résoudre avant.

---

## Récupérer tes données actuelles

Tes séances cochées et bilans de l'ancienne version ne sont pas transférés automatiquement (stockage différent). Pour les récupérer :

1. Ouvre ton ancienne app → **🔄 Export / Import** → **Télécharger le fichier de sauvegarde**
2. Ouvre la nouvelle app → **🔄 Export / Import** → **Choisir le fichier de sauvegarde**

À faire une seule fois.

---

## En cas de souci

| Symptôme | Piste |
|---|---|
| Page blanche sur github.io | Vérifie que `VITE_BASE` correspond exactement au nom du dépôt (`/marathon-app/`) |
| L'analyse renvoie une erreur | Vérifie ton crédit sur console.anthropic.com et que `ANTHROPIC_API_KEY` est bien enregistrée |
| Strava boucle sans se connecter | Le **Callback Domain** Strava doit correspondre à ton domaine Cloudflare, sans `https://` |
| Le déploiement échoue | Onglet **Actions** du dépôt → clique sur le job en rouge pour voir le message d'erreur |
