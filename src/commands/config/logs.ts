import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} from "discord.js";
import type { LogSettings } from "@prisma/client";
import { prisma } from "../../database/client";
import type { Command } from "../../types";
import { baseEmbed, errorEmbed } from "../../utils/embeds";

const CATEGORIES = [
  { value: "moderation", label: "Modération", emoji: "🔨", column: "moderationChannelId" },
  { value: "ticket", label: "Tickets", emoji: "🎫", column: "ticketChannelId" },
  { value: "giveaway", label: "Giveaways", emoji: "🎉", column: "giveawayChannelId" },
  { value: "config", label: "Configuration", emoji: "⚙️", column: "configChannelId" },
] as const;
type LogColumn = (typeof CATEGORIES)[number]["column"];

function settingsEmbed(settings: LogSettings) {
  const embed = baseEmbed()
    .setTitle("📑 Configuration des logs")
    .setDescription("Choisis une catégorie puis le salon où envoyer ses logs.");
  for (const cat of CATEGORIES) {
    const channelId = settings[cat.column];
    embed.addFields({
      name: `${cat.emoji} ${cat.label}`,
      value: channelId ? `<#${channelId}>` : "*Non défini*",
      inline: true,
    });
  }
  return embed;
}

function mainComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("lcfg:cat")
    .setPlaceholder("Choisir une catégorie de logs...")
    .addOptions(CATEGORIES.map((cat) => ({ label: cat.label, value: cat.value, emoji: cat.emoji })));
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("lcfg:done").setLabel("Terminer").setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}

const command: Command = {
  name: "logs",
  category: "Configuration",
  description: "Configure les salons de logs (modération, tickets, giveaways, config).",
  usage: "logs",
  level: "ADMIN",
  cooldown: 5,
  run: async (_client, message) => {
    if (!message.guild) return;
    const guild = message.guild;

    let settings = await prisma.logSettings.upsert({
      where: { guildId: guild.id },
      update: {},
      create: { guildId: guild.id },
    });

    const panel = await message.reply({
      embeds: [settingsEmbed(settings)],
      components: mainComponents(),
      allowedMentions: { repliedUser: false },
    });

    const collector = panel.createMessageComponentCollector({ time: 10 * 60 * 1000 });

    collector.on("collect", async (interaction) => {
      try {
        if (interaction.user.id !== message.author.id) {
          await interaction
            .reply({
              embeds: [errorEmbed(`Ce panneau est réservé à <@${message.author.id}>.`)],
              ephemeral: true,
            })
            .catch(() => null);
          return;
        }

        // ---- Choix de la catégorie ----
        if (interaction.isStringSelectMenu() && interaction.customId === "lcfg:cat") {
          const cat = CATEGORIES.find((c) => c.value === interaction.values[0]);
          if (!cat) return;
          const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId(`lcfg:set:${cat.value}`)
            .setPlaceholder(`Salon des logs ${cat.label}...`)
            .setChannelTypes(ChannelType.GuildText);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("lcfg:back")
              .setLabel("Retour")
              .setEmoji("↩️")
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId(`lcfg:clear:${cat.value}`)
              .setLabel("Retirer le salon")
              .setStyle(ButtonStyle.Danger)
          );
          await interaction.update({
            components: [
              new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
              row,
            ],
          });
          return;
        }

        // ---- Choix du salon pour la catégorie ----
        if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("lcfg:set:")) {
          const cat = CATEGORIES.find((c) => c.value === interaction.customId.split(":")[2]);
          if (!cat) return;
          const data: Partial<Record<LogColumn, string | null>> = {
            [cat.column]: interaction.values[0],
          };
          settings = await prisma.logSettings.update({ where: { guildId: guild.id }, data });
          await interaction.update({ embeds: [settingsEmbed(settings)], components: mainComponents() });
          return;
        }

        // ---- Boutons ----
        if (interaction.isButton()) {
          if (interaction.customId === "lcfg:back") {
            await interaction.update({ embeds: [settingsEmbed(settings)], components: mainComponents() });
            return;
          }
          if (interaction.customId.startsWith("lcfg:clear:")) {
            const cat = CATEGORIES.find((c) => c.value === interaction.customId.split(":")[2]);
            if (!cat) return;
            const data: Partial<Record<LogColumn, string | null>> = { [cat.column]: null };
            settings = await prisma.logSettings.update({ where: { guildId: guild.id }, data });
            await interaction.update({ embeds: [settingsEmbed(settings)], components: mainComponents() });
            return;
          }
          if (interaction.customId === "lcfg:done") {
            collector.stop("done");
            await interaction.update({ embeds: [settingsEmbed(settings)], components: [] });
            return;
          }
        }
      } catch (error) {
        console.error("[LOGS] Erreur du panneau :", error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ embeds: [errorEmbed("Erreur du panneau, réessaie.")], ephemeral: true })
            .catch(() => null);
        }
      }
    });

    collector.on("end", async () => {
      await panel.edit({ components: [] }).catch(() => null);
    });
  },
};

export default command;
