# FloatFrame 🌐

A floating window you launch from your browser console that displays another website in an iframe, on top of any page.

## Features

- 🪟 Draggable and resizable floating window
- 🔘 Ready-made site buttons (FrAnime, BrainworxEdu, KartBros, BikeBros)
- ➕ Add your own links manually, saved in your browser
- ⛶ Maximize / restore button
- — Minimize to a small floating bubble
- ✕ Close button
- 📺 Fullscreen support for video players and games
- 🔗 `https://` is added automatically

## Usage

1. Open your browser console (`F12`, **Console** tab).
2. Paste this command and press Enter:

```javascript
fetch("https://raw.githubusercontent.com/hugu641/ConsChromeGame/main/floatframe.js").then(r=>r.text()).then(eval)
```

### As a bookmarklet

Create a bookmark and use this code as its URL to launch FloatFrame in one click:

```
javascript:fetch("https://raw.githubusercontent.com/hugu641/ConsChromeGame/main/floatframe.js").then(r=>r.text()).then(eval)
```

## 🎰 Casino (jetons virtuels)

Une tuile **Casino** apparaît dans le hub : machine à sous, pile ou face, roulette, bonus quotidien et classement. Les jetons n'ont aucune valeur réelle.

**Anti-triche** : le script tourne dans le navigateur du joueur, donc rien de ce qu'il contient n'est digne de confiance. Toute la logique est dans un petit serveur (`worker/`, Cloudflare Workers + base D1) :
- les comptes et les mots de passe (hachés PBKDF2 + sel) sont côté serveur ;
- les tirages sont faits par le serveur (`crypto.getRandomValues`), le client n'envoie que sa mise et son choix ;
- chaque partie est un seul `UPDATE` SQL atomique : impossible de dépenser deux fois le même solde en envoyant des requêtes en parallèle ;
- sessions par token aléatoire, verrouillage après 5 mots de passe faux, 5 inscriptions max par IP et par heure.

GitHub ne peut pas servir de base de données sécurisée depuis le navigateur (il faudrait publier un token d'écriture dans le code), c'est pourquoi la base est sur Cloudflare. Tout passe en HTTPS (port 443).

### Déployer le serveur (gratuit)

```bash
cd worker
npx wrangler login
npx wrangler d1 create floatframe-casino        # copie le database_id dans wrangler.toml
npx wrangler d1 execute floatframe-casino --remote --file=schema.sql
npx wrangler deploy                             # affiche l'URL du Worker
```

Puis mets cette URL dans la constante `API` en haut de `casino.js` et pousse le fichier sur GitHub. Si le domaine `workers.dev` est bloqué sur ton réseau, attache un domaine perso au Worker depuis le tableau de bord Cloudflare.

## Customization

Edit the `DEFAULT_SITES` array at the top of `floatframe.js` to change the default sites. The **↺** button in the window resets the list to the defaults.

## Limitations

- Some websites refuse to be displayed in an iframe (`X-Frame-Options` / CSP). In that case the frame stays blank.
- Some websites block `fetch` or `eval` through their security policy, so the script won't run on them.
- Favorites are saved in the `localStorage` of the site you run the script on.

## Disclaimer

This script loads and runs external code. Always read the code before running it in your console.
