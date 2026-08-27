# 🏃 Contexte du projet — App Marathon

*Note de référence pour Claude et pour moi. À jour au 11 août 2026.*

---

## L'objectif

Marathon de **Saramon (Gers)**, le **dimanche 1er novembre 2026**.
Objectif de temps : **4:35:00**, soit **6:31/km**.

Plan de 16 semaines démarré le 14 juillet 2026, 3 séances par semaine :
mardi soir, vendredi soir, sortie longue le dimanche matin.

Records personnels (Garmin) : semi en 1h55'30, 10 km en 49'03, 5 km en 22'59.
Plus longue sortie à ce jour : 22,34 km.

---

## ⚠️ Le fichier qui fait foi

**`App.jsx`** dans ce projet est la version de référence (v22).

Si une autre version circule (ancien artefact, autre conversation), c'est celle-ci
qui prime. Une version obsolète avec un objectif à 4:00:00 ou 4:45:00 a déjà causé
de la confusion — ne pas repartir de là.

---

## Où tourne l'app

| Quoi | Adresse |
|---|---|
| **L'app** | https://jdemdem86.github.io/marathon-app/ |
| **Le dépôt** | github.com/Jdemdem86/marathon-app |
| **Le service (clés secrètes)** | https://marathon-api.demeurant-j.workers.dev |

Le code du service vit aussi dans le dépôt (dossier `worker`) et se déploie
automatiquement : plus aucune dépendance à un ordinateur précis.

Installée sur l'écran d'accueil du téléphone (Xiaomi / MIUI / Chrome).

---

## 🔄 Comment mettre à jour

Tout se fait depuis GitHub, dans un navigateur — aucun logiciel, aucun PC particulier.

- **L'app** : dossier `src` → `App.jsx` → crayon ✏️ → tout remplacer → **Commit changes**
- **Le service** : dossier `worker` → `index.js` → crayon ✏️ → **Commit changes**

Chacun a son robot de déploiement (`Build & Deploy` et `Deploy Worker`).
Détail complet dans `PROCEDURE-MAJ.md`.

**Rien d'autre à faire.** Pas de republication, pas de vidage de cache,
pas de réinstallation sur l'écran d'accueil, pas d'export/import.

*Pourquoi ça marche : chaque build génère un fichier au nom unique
(`index.28YJIjnh.js`). Le navigateur ne peut donc pas afficher une vieille version.*

---

## L'architecture

```
Téléphone (écran d'accueil)
   ↓
GitHub Pages ── déploiement auto via GitHub Actions à chaque commit
   ↓
Cloudflare Worker ── garde les clés secrètes côté serveur
   ├── /api/analyze        → API Anthropic (analyse des séances)
   └── /api/strava/*       → API Strava (récupération des sorties)
```

Les données (séances cochées, bilans, séances modifiées) sont stockées
dans le navigateur du téléphone, et survivent aux mises à jour.

---

## Ce que fait l'app

- **Plan** : 16 semaines, 4 phases (BASE, DÉVELOPPEMENT, SPÉCIFIQUE, AFFÛTAGE),
  avec édition de n'importe quelle séance directement dans l'app
- **Hydra** : plan d'hydratation adapté au climat du Gers, recette de boisson maison
- **Course** : stratégie de pacing jour J, temps de passage, projection Riegel
- **Progrès** : courbes d'allure, FC et ressenti au fil des séances
- **Bilans** : analyses Claude des séances passées

Récupération automatique des sorties depuis Strava (allure, FC, distance,
durée, cadence, température) dans le formulaire de saisie.

**Découpage par tours** : Strava renvoie aussi les tours de la montre (bouton *lap*).
L'app isole le corps de séance — l'échauffement et le retour au calme sont exclus du
calcul d'allure. Détection automatique (via `target.mpKm` ou l'allure cible),
ajustable d'un tap. C'est l'allure du bloc qui est comparée à la cible dans l'analyse.
⚠️ Sans appui sur le bouton *lap* pendant la séance, il n'y a qu'un seul tour et
l'app retombe sur la moyenne globale.

---

## Allures actuelles (base 4:35:00)

| Type | Allure |
|---|---|
| Footing | 7:45/km |
| Footing léger (récup) | 8:05/km |
| Sortie longue Zone 2 | 7:10 – 7:30/km |
| **Allure marathon** | **6:31/km** |
| Tempo | 5:55/km |
| Fractionné | 5:45/km |

FC max ~199 bpm (198 atteint en fractionné), FC repos ~54-55, 40 ans.
Zones calculées par la méthode Karvonen.

⚠️ Changer l'objectif implique de **recalculer toutes les allures des 16 semaines**,
pas seulement l'en-tête. C'est une opération à traiter en entier.

---

## Préférences de travail

- Vérifier réellement le code (build + test de rendu) avant de livrer,
  pas seulement la syntaxe — ça a permis d'attraper plusieurs vrais bugs
- Être honnête sur ce qui n'a pas pu être testé plutôt que de le présenter comme acquis
- Mobile d'abord : cibles tactiles larges, fenêtres qui défilent correctement
- Approche naturelle pour la nutrition (boisson maison plutôt que produits du commerce)
- L'analyse d'une séance commence toujours par la comparaison d'allure
  (réelle vs cible, avec l'écart en secondes)

---

## Historique utile

- Longue galère avec le cache mobile : chaque mise à jour imposait de réinstaller
  l'app et de réimporter les données. Testé sans succès : nom de fichier stable,
  bouton de rafraîchissement forcé, lien publié, redirecteur GitHub.
  **Résolu définitivement** par la refonte en vrai projet web avec noms de fichiers
  générés à partir du contenu.
- Strava passait autrefois par une IA pour lire les données : peu fiable.
  Passe maintenant par l'API officielle, avec renouvellement automatique du jeton.
- Objectif révisé deux fois : 4:00:00 → 4:45:00 → 4:35:00.
