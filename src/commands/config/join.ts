import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import type { JoinSettings } from "@prisma/client";
import { config } from "../../config/config";
import { prisma } from "../../database/client";
import type { Command } from "../../types";
import { baseEmbed, errorEmbed, replyError } from "../../utils/embeds";
import { promptModal } from "../../utils/modals";
import { parseStringArray, truncate } from "../../utils/text";

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function settingsEmbed(settings: JoinSettings) {
  const na = "*Non défini*";
  const roles = parseStringArray(settings.autoRoles);
  return baseEmbed()
    .setTitle("👋 Configuration des arrivées (join settings)")
    .setDescription(
      "Variables disponibles : `{user}` (mention), `{username}`, `{server}`, `{memberCount}`, `{userId}`."
    )
    .addFields(
      { name: "Statut", value: settings.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      { name: "Salon", value: settings.channelId ? `<#${settings.channelId}>` : na, inline: true },
      {
        name: "Format",
        value: settings.useEmbed ? `Embed (couleur \`${settings.embedColor}\`)` : "Message simple",
        inline: true,
      },
      {
        name: "MP à l'arrivée",
        value: settings.dmEnabled ? "✅ Activé" : "❌ Désactivé",
        inline: true,
      },
      {
        name: "Rôles automatiques",
        value:
          roles.length > 0 ? truncate(roles.map((id) => `<@&${id}>`).join(", "), 1024) : "*Aucun*",
        inline: false,
      },
      { name: "Message de bienvenue", value: truncate(settings.message, 300), inline: false },
      { name: "Message privé", value: truncate(settings.dmMessage, 200), inline: false }
    );
}

function mainComponents(settings: JoinSettings) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("jcfg:field")
    .setPlaceholder("Choisir un paramètre à modifier...")
    .addOptions(
      { label: "Salon de bienvenue", value: "channel", emoji: "📢" },
      { label: "Message de bienvenue", value: "message", emoji: "✏️" },
      { label: "Couleur de l'embed", value: "embedcolor", emoji: "🎨" },
      { label: "Message privé", value: "dmmessage", emoji: "📩" },
      { label: "Rôles automatiques (max 5)", value: "autoroles", emoji: "🎭" }
    );
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("jcfg:toggle")
      .setLabel(settings.enabled ? "Désactiver" : "Activer")
      .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("jcfg:embed")
      .setLabel(settings.useEmbed ? "Format : Embed" : "Format : Texte")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("jcfg:dm")
      .setLabel(settings.dmEnabled ? "MP : Activé" : "MP : Désactivé")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("jcfg:done").setLabel("Terminer").setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}

function backRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("jcfg:back")
      .setLabel("Retour")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );
}

const command: Command = {
  name: "join",
  category: "Configuration",
  description: "Configure les messages de bienvenue, MP et rôles automatiques.",
  usage: "join settings",
  level: "ADMIN",
  cooldown: 5,
  run: async (_client, message, args) => {
    if ((args[0] ?? "").toLowerCase() !== "settings") {
      await replyError(message, `Syntaxe : \`${config.prefix}join settings\``);
      return;
    }
    if (!message.guild) return;
    const guild = message.guild;

    let settings = await prisma.joinSettings.upsert({
      where: { guildId: guild.id },
      update: {},
      create: { guildId: guild.id },
    });

    const panel = await message.reply({
      embeds: [settingsEmbed(settings)],
      components: mainComponents(settings),
      allowedMentions: { repliedUser: false },
    });

    const refresh = async (): Promise<void> => {
      await panel
        .edit({ embeds: [settingsEmbed(settings)], components: mainComponents(settings) })
        .catch(() => null);
    };

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

        // ---- Menu principal ----
        if (interaction.isStringSelectMenu() && interaction.customId === "jcfg:field") {
          const field = interaction.values[0];

          if (field === "channel") {
            const channelSelect = new ChannelSelectMenuBuilder()
              .setCustomId("jcfg:set:channel")
              .setPlaceholder("Salon des messages de bienvenue...")
              .setChannelTypes(ChannelType.GuildText);
            await interaction.update({
              components: [
                new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
                backRow(),
              ],
            });
            return;
          }

          if (field === "autoroles") {
            const roleSelect = new RoleSelectMenuBuilder()
              .setCustomId("jcfg:set:autoroles")
              .setPlaceholder("Jusqu'à 5 rôles (vide = aucun)...")
              .setMinValues(0)
              .setMaxValues(5);
            await interaction.update({
              components: [
                new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
                backRow(),
              ],
            });
            return;
          }

          if (field === "message" || field === "dmmessage") {
            const isDm = field === "dmmessage";
            const result = await promptModal(
              interaction,
              "jcfg",
              field,
              isDm ? "Message privé ({user}, {server}...)" : "Message de bienvenue ({user}...)",
              isDm ? settings.dmMessage : settings.message,
              1000,
              true
            );
            if (!result) {
              await refresh();
              return;
            }
            settings = await prisma.joinSettings.update({
              where: { guildId: guild.id },
              data: isDm ? { dmMessage: result.value } : { message: result.value },
            });
            await refresh();
            return;
          }

          if (field === "embedcolor") {
            const result = await promptModal(
              interaction,
              "jcfg",
              field,
              "Couleur hexadecimale (ex : #57F287)",
              settings.embedColor,
              7,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            if (!HEX_REGEX.test(result.value)) {
              await result.submitted
                .followUp({
                  embeds: [errorEmbed("Couleur invalide : format attendu `#RRGGBB`.")],
                  ephemeral: true,
                })
                .catch(() => null);
              await refresh();
              return;
            }
            settings = await prisma.joinSettings.update({
              where: { guildId: guild.id },
              data: { embedColor: result.value },
            });
            await refresh();
            return;
          }
          return;
        }

        // ---- Sélecteur de salon ----
        if (interaction.isChannelSelectMenu() && interaction.customId === "jcfg:set:channel") {
          settings = await prisma.joinSettings.update({
            where: { guildId: guild.id },
            data: { channelId: interaction.values[0] },
          });
          await interaction.update({
            embeds: [settingsEmbed(settings)],
            components: mainComponents(settings),
          });
          return;
        }

        // ---- Sélecteur de rôles automatiques ----
        if (interaction.isRoleSelectMenu() && interaction.customId === "jcfg:set:autoroles") {
          const roleIds = interaction.values.filter((id) => id !== guild.id); // jamais @everyone
          settings = await prisma.joinSettings.update({
            where: { guildId: guild.id },
            data: { autoRoles: JSON.stringify(roleIds) },
          });
          await interaction.update({
            embeds: [settingsEmbed(settings)],
            components: mainComponents(settings),
          });
          return;
        }

        // ---- Boutons ----
        if (interaction.isButton()) {
          if (interaction.customId === "jcfg:back") {
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "jcfg:toggle") {
            if (!settings.enabled && !settings.channelId && !settings.dmEnabled) {
              await interaction
                .reply({
                  embeds: [
                    errorEmbed("Définis d'abord un **salon de bienvenue** (ou active le MP)."),
                  ],
                  ephemeral: true,
                })
                .catch(() => null);
              return;
            }
            settings = await prisma.joinSettings.update({
              where: { guildId: guild.id },
              data: { enabled: !settings.enabled },
            });
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "jcfg:embed") {
            settings = await prisma.joinSettings.update({
              where: { guildId: guild.id },
              data: { useEmbed: !settings.useEmbed },
            });
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "jcfg:dm") {
            settings = await prisma.joinSettings.update({
              where: { guildId: guild.id },
              data: { dmEnabled: !settings.dmEnabled },
            });
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "jcfg:done") {
            collector.stop("done");
            await interaction.update({ embeds: [settingsEmbed(settings)], components: [] });
            return;
          }
        }
      } catch (error) {
        console.error("[JOIN SETTINGS] Erreur du panneau :", error);
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
