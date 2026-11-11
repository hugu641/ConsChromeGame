# FloatFrame 🌐

A floating window you launch from your browser console that displays another website in an iframe, on top of any page.

## Features

- 🪟 Draggable and resizable floating window
- 📁 **Organisation par dossiers / fichiers thématiques** (Call of Duty & Zombies, FPS & Rétro, GTA & Open World, Course, Glisse & Sport, Multijoueur...)
- 🔍 **Barre de recherche instantanée** avec filtrage en temps réel et raccourci clavier (`/`)
- 🔘 Ready-made site buttons & hub organisé
- ➕ Add your own links manually with custom folder selection, saved in your browser
- ✏️ Edit, rename and organize favorites into folders
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

Une tuile **Casino** apparaît dans le hub :
- 🃏 **Blackjack** : Distribution, Tirer (Hit), Rester (Stand), Doubler (Double Down), Blackjack naturel (3:2), croupier automatique.
- 🎡 **Roulette européenne** : Table interactive avec numéros pleins (×36), douzaines (×3), colonnes (×3), couleurs (×2), parités (×2) et moitiés (×2) avec historique des tirages.
- 💣 **Mines** : Grille 5×5 personnalisable (1 à 24 mines), multiplicateurs croissants et encaissement libre (Cash Out) à tout moment.
- 🎰 **Machine à sous** : 3 rouleaux avec multiplicateurs jusqu'à ×40.
- 🪙 **Pile ou face** : Tirage instantané (×1,95).
- 🎁 **Bonus du jour** (+500 🪙 toutes les 24h) et 🏆 **Classement Top 10** des plus riches.

Les jetons n'ont aucune valeur réelle.

**Anti-triche** : le script tourne dans le navigateur du joueur, donc rien de ce qu'il contient n'est digne de confiance. Toute la logique est dans un serveur (`worker/`, Cloudflare Workers + base D1) :
- les comptes et les mots de passe (hachés PBKDF2 + sel) sont côté serveur ;
- les tirages, les paquets de cartes et les mines sont générés côté serveur (`crypto.getRandomValues`) ;
- chaque mise et gain est validé via des transactions SQL atomiques : impossible de dupliquer ou falsifier les soldes ;
- persistance des parties en cours (reprise automatique après reconnexion ou rafraîchissement) ;
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

## 💡 Proposer un site & Modération Discord

Les utilisateurs peuvent soumettre des propositions de sites ou jeux directement depuis le hub FloatFrame :
- **Sécurité totale** : La requête part de FloatFrame vers le serveur Cloudflare. L'URL du webhook Discord n'est jamais exposée aux utilisateurs.
- **Notification Discord automatique** : Un embed est envoyé avec le nom du site, le lien, le dossier suggéré et l'auteur.
- **Validation en un clic** : L'administrateur peut cliquer directement sur **[✅ ACCEPTER CE SITE]** ou **[❌ REFUSER LA DEMANDE]** depuis Discord.

### Configurer le Webhook Discord (Gratuit & 24/7) :

```bash
cd worker
npx wrangler secret put DISCORD_WEBHOOK_URL  # Colle l'URL de ton Webhook Discord
npx wrangler deploy
```

*(Un bot Discord optionnel avec de vrais boutons interactifs est également disponible dans le dossier `discord-bot/`).*

## Customization

Edit the `DEFAULT_SITES` array at the top of `floatframe.js` to change the default sites. The **↺** button in the window resets the list to the defaults.

## Limitations

- Some websites refuse to be displayed in an iframe (`X-Frame-Options` / CSP). In that case the frame stays blank.
- Some websites block `fetch` or `eval` through their security policy, so the script won't run on them.
- Favorites are saved in the `localStorage` of the site you run the script on.

## Disclaimer

This script loads and runs external code. Always read the code before running it in your console.
