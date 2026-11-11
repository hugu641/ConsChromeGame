# Intégration Discord pour FloatFrame 🤖

Ce module permet de recevoir instantanément chaque proposition de site effectuée par un joueur dans FloatFrame et de l'**accepter ou refuser** en un clic.

---

## ⚡ Méthode 1 : Webhook Cloudflare (Recommandée - 0 hébergement)

Cette méthode est **100% gratuite, sans serveur additionnel** et fonctionne 24h/24 directement via Cloudflare Worker.

### 1. Créer le Webhook sur Discord
1. Sur Discord, ouvre les **Paramètres du salon** où tu veux recevoir les demandes (ex: `#propositions` ou `#staff`).
2. Va dans **Intégrations** > **Webhooks** > **Nouveau Webhook**.
3. Nomme-le `FloatFrame` et clique sur **Copier l'URL du Webhook**.

### 2. Ajouter l'URL du Webhook dans Cloudflare
Dans ton terminal, dans le dossier `worker/` :

```bash
cd worker
npx wrangler secret put DISCORD_WEBHOOK_URL
```
Colle l'URL du Webhook copiée à l'étape 1 et appuie sur Entrée.

Puis déploie le worker :
```bash
npx wrangler deploy
```

### 3. Fonctionnement
- Dès qu'un joueur clique sur **💡 Proposer un site** dans FloatFrame et remplit le formulaire, une notification détaillée s'affiche sur Discord avec les informations du site.
- Tu reçois deux liens cliquables :
  - **[✅ ACCEPTER CE SITE]** : valide le site, le marque `approved` en base de données et t'affiche le JSON à jour.
  - **[❌ REFUSER LA DEMANDE]** : refuse la demande et l'archive.

---

## 🛠️ Méthode 2 : Bot Discord Node.js (Boutons interactifs natifs)

Si tu souhaites que l'acceptation se fasse avec de véritables **boutons Discord intégrés** (`discord.js`) sans quitter l'application Discord :

1. Crée une application et un Bot sur le [Portail Développeur Discord](https://discord.com/developers/applications).
2. Récupère le **Bot Token** et invite le bot sur ton serveur avec les permissions `Send Messages` et `Embed Links`.
3. Configure les variables d'environnement :
   ```bash
   cd discord-bot
   npm install
   export DISCORD_BOT_TOKEN="ton_token_ici"
   export NOTIFICATION_CHANNEL_ID="id_du_salon"
   node bot.js
   ```
