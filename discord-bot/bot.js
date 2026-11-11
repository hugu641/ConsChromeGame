/**
 * FloatFrame Discord Bot 🤖
 *
 * Ce bot permet de recevoir les propositions de sites faites par les utilisateurs
 * et d'afficher des boutons interactifs [✅ Accepter] et [❌ Refuser] directement dans Discord.
 *
 * NOTE : Si tu ne souhaites pas héberger un bot Node.js 24/7, le Webhook Cloudflare
 * suffit largement ! Voir README.md pour la configuration en 1 minute.
 */

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");

// Configuration (à définir via variables d'environnement ou directement ici)
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "TON_TOKEN_BOT_DISCORD";
const WORKER_API_URL = process.env.WORKER_API_URL || "https://floatframe-casino.hug6314.workers.dev";
const NOTIFICATION_CHANNEL_ID = process.env.NOTIFICATION_CHANNEL_ID || "ID_DU_SALON_DISCORD";

if (!DISCORD_BOT_TOKEN || DISCORD_BOT_TOKEN === "TON_TOKEN_BOT_DISCORD") {
  console.log("ℹ️ [FloatFrame Bot] Token bot non configuré.");
  console.log("👉 Si tu utilises la méthode sans serveur (Webhook Cloudflare), ce script n'a pas besoin d'être lancé.");
  console.log("👉 Pour activer ce bot avec boutons natifs Discord :");
  console.log("   1. Définis la variable d'environnement DISCORD_BOT_TOKEN");
  console.log("   2. Définis NOTIFICATION_CHANNEL_ID avec l'ID du salon");
  console.log("   3. Lance : npm install && npm start\n");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", () => {
  console.log(`✅ [FloatFrame Bot] Connecté en tant que ${client.user.tag}`);
});

// Gestion des interactions (clics sur les boutons)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const [prefix, action, id, token] = interaction.customId.split("_");
  if (prefix !== "ff") return;

  await interaction.deferUpdate();

  try {
    const url = `${WORKER_API_URL}/api/suggest/action?id=${id}&token=${token}&action=${action}`;
    const res = await fetch(url);

    if (action === "approve") {
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("disabled_approved")
          .setLabel("Accepté ✓")
          .setStyle(ButtonStyle.Success)
          .setDisabled(true)
      );

      await interaction.editReply({
        components: [updatedRow],
      });
      await interaction.followUp({
        content: `✅ Le site a été **accepté** par <@${interaction.user.id}> !`,
        ephemeral: false,
      });
    } else if (action === "reject") {
      const updatedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("disabled_rejected")
          .setLabel("Refusé ✕")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await interaction.editReply({
        components: [updatedRow],
      });
      await interaction.followUp({
        content: `❌ La demande a été **refusée** par <@${interaction.user.id}>.`,
        ephemeral: false,
      });
    }
  } catch (err) {
    console.error("Erreur action bot:", err);
    await interaction.followUp({
      content: `⚠️ Erreur lors du traitement : ${err.message}`,
      ephemeral: true,
    });
  }
});

if (DISCORD_BOT_TOKEN && DISCORD_BOT_TOKEN !== "TON_TOKEN_BOT_DISCORD") {
  client.login(DISCORD_BOT_TOKEN).catch((err) => {
    console.error("❌ Échec de connexion du bot Discord :", err.message);
  });
}
