# MesTraitements — PWA avec notifications push réelles

Application web installable (PWA) pour le suivi de traitements médicamenteux :
rappels par créneau (avec **vraies notifications**, même app fermée), suivi de
stock, historique partageable, abonnement Premium via Stripe.

## ⚠️ Changement important de méthode de déploiement

Avec l'ajout des vraies notifications push, ce projet utilise maintenant des
**fonctions serverless** (petits bouts de serveur gratuits fournis par Netlify).
**Le glisser-déposer simple ne fonctionne plus** pour ce projet — il faut
déployer via un dépôt **GitHub** connecté à Netlify.

## Déployer (méthode GitHub — 15-20 min la première fois)

### 1. Créer un compte GitHub (gratuit)
Va sur https://github.com/signup si tu n'en as pas déjà un.

### 2. Créer un nouveau dépôt
- Sur github.com, clique sur **"New repository"** (bouton vert)
- Nom : `mestraitements` (ou ce que tu veux)
- Laisse "Public" ou "Private", peu importe
- Ne coche aucune case d'initialisation (pas de README, pas de .gitignore)
- Clique **"Create repository"**

### 3. Uploader les fichiers de ce dossier
- Sur la page de ton nouveau dépôt vide, clique **"uploading an existing file"**
- Glisse **tous les fichiers et dossiers** de ce projet (`index.html`, `app.js`,
  `netlify/`, `netlify.toml`, `package.json`, etc.) dans la zone
- Clique **"Commit changes"** en bas

### 4. Connecter Netlify à ce dépôt
- Sur ton dashboard Netlify, va dans le site existant "mestraitements"
- **Site settings → Build & deploy → Link repository** (ou crée un nouveau
  site via **"Add new site" → "Import an existing project" → GitHub**)
- Autorise Netlify à accéder à GitHub, sélectionne le dépôt `mestraitements`
- Netlify détecte automatiquement `netlify.toml` — laisse les réglages par défaut
- Clique **"Deploy"**

### 5. Ajouter les clés secrètes (variables d'environnement)
**Indispensable pour que les notifications fonctionnent.** Sur Netlify :
- **Site settings → Environment variables → Add a variable**
- Ajoute ces trois variables :

| Nom | Valeur |
|---|---|
| `VAPID_PUBLIC_KEY` | `BNWd5u10_VhkGVkwyQO2Ny_9fQwBdkwBuiDxrENsRCdV-HYdDsm2BB5cjk-YdLk0AgujbzxHX2OTFDKp6bFilwQ` |
| `VAPID_PRIVATE_KEY` | `iAvGTsWPnj82wdQz3_nvvUpPYAqromqwqss-wpMFEAM` |
| `VAPID_CONTACT_EMAIL` | `mailto:Djeproductionpro@gmail.com` |

⚠️ La clé **privée** ne doit jamais apparaître dans le code ou être partagée
publiquement — c'est pour ça qu'elle va uniquement dans les variables
d'environnement Netlify, jamais dans un fichier du dépôt.

- Après avoir ajouté les variables, redéploie le site (**Deploys → Trigger deploy**)

### 6. Activer le stockage (Netlify Blobs)
Netlify Blobs (la petite base de données qui garde les abonnements aux
notifications) s'active automatiquement dès que le site est déployé avec des
fonctions — rien à faire de plus normalement. Si une fonction échoue avec une
erreur liée à "blobs", les logs de fonction Netlify l'indiqueront clairement.

## Comment ça marche maintenant

1. Quand quelqu'un autorise les notifications dans l'app, le navigateur crée
   un "abonnement push" unique
2. L'app envoie cet abonnement + le planning des prises (heures + noms des
   médicaments) + le fuseau horaire à une fonction Netlify (`save-subscription`)
3. Une deuxième fonction (`send-reminders`) tourne **automatiquement chaque
   minute** (configuré dans `netlify.toml`), vérifie tous les abonnements
   stockés, et envoie une vraie notification push si l'heure locale de
   l'utilisateur correspond à une prise prévue
4. La notification arrive **même si l'app est complètement fermée**, sur
   Android et sur iPhone (iOS 16.4+, à condition que l'app ait été ajoutée à
   l'écran d'accueil et que les notifications aient été autorisées depuis
   l'app installée, pas juste depuis Safari)

## Limites encore présentes

- **iPhone plus ancien qu'iOS 16.4** : les notifications web ne fonctionneront
  toujours pas, c'est une limite d'Apple, pas du code.
- **Fuseau horaire** : capturé automatiquement depuis l'appareil de
  l'utilisateur à chaque mise à jour de traitement — se recalibre tout seul
  même en cas de changement d'heure été/hiver.
- **Gratuit dans les limites de l'offre Netlify** : la fonction tourne toutes
  les minutes, ce qui reste largement dans le quota gratuit (125 000
  exécutions/mois) pour un usage avec quelques dizaines/centaines d'utilisateurs.
  Si l'app grossit beaucoup, il faudra surveiller l'usage dans
  **Site settings → Usage**.

## Mettre à jour le site après ce changement

Comme le déploiement passe maintenant par GitHub, pour toute future mise à
jour du code : remplace les fichiers modifiés directement sur la page GitHub
du dépôt (bouton "Add file" → "Upload files", ou éditer un fichier existant
via le petit crayon), Netlify redéploiera automatiquement à chaque
modification du dépôt.

## Activer les paiements (Stripe — déjà fait)

Le lien de paiement en production est déjà intégré dans `app.js`
(`CONFIG.STRIPE_PAYMENT_LINK`). Rien à refaire ici.

**Limite importante à connaître** : sans backend de vérification, ce système
fait confiance au navigateur pour le déblocage Premium — suffisant pour
démarrer, mais pas blindé contre un utilisateur technique qui voudrait
contourner le paywall.

## Politique de confidentialité

Le fichier `confidentialite.html` est prêt, déjà personnalisé avec les
informations de contact fournies.

## Structure des fichiers

- `index.html` — page principale
- `confidentialite.html` — politique de confidentialité
- `style.css` — tous les styles
- `app.js` — toute la logique (état, rendu, notifications push, Premium)
- `manifest.json` — métadonnées de l'app installable
- `service-worker.js` — cache hors-ligne + affichage des notifications push reçues
- `netlify.toml` — configuration du déploiement et de la fonction programmée
- `package.json` — dépendances des fonctions serverless (web-push, Netlify Blobs)
- `netlify/functions/save-subscription.js` — enregistre un abonnement aux notifications
- `netlify/functions/delete-subscription.js` — supprime un abonnement
- `netlify/functions/send-reminders.js` — tourne chaque minute, envoie les vraies notifications
- `icons/` — icônes aux formats requis
