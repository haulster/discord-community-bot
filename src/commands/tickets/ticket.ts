import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ColorResolvable,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import type { TicketSettings } from "@prisma/client";
import { config } from "../../config/config";
import { prisma } from "../../database/client";
import { buildPanelRow, getOrCreateTicketSettings } from "../../services/ticketService";
import type { Command } from "../../types";
import { baseEmbed, errorEmbed, successEmbed, replyError } from "../../utils/embeds";
import { truncate } from "../../utils/text";

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

type TextKey =
  | "panelTitle"
  | "panelDescription"
  | "panelColor"
  | "panelEmoji"
  | "nameFormat"
  | "openMessage"
  | "closeMessage";

const TEXT_FIELDS: Record<string, { label: string; key: TextKey; max: number; long: boolean }> = {
  title: { label: "Titre du panneau", key: "panelTitle", max: 100, long: false },
  description: { label: "Description du panneau", key: "panelDescription", max: 1000, long: true },
  color: { label: "Couleur hexadecimale (ex : #5865F2)", key: "panelColor", max: 7, long: false },
  emoji: { label: "Emoji (ex : 🎫 ou <:nom:id>)", key: "panelEmoji", max: 64, long: false },
  nameformat: { label: "Format du nom ({username}, {number})", key: "nameFormat", max: 60, long: false },
  openmessage: { label: "Message d'ouverture", key: "openMessage", max: 1000, long: true },
  closemessage: { label: "Message de fermeture", key: "closeMessage", max: 1000, long: true },
};

/** Embed récapitulatif de la configuration actuelle. */
function settingsEmbed(settings: TicketSettings) {
  const na = "*Non défini*";
  return baseEmbed()
    .setTitle(`${config.emojis.ticket} Configuration des tickets`)
    .setDescription("Utilise le menu pour modifier un paramètre, puis publie le panneau.")
    .addFields(
      { name: "Système", value: settings.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      {
        name: "Catégorie",
        value: settings.categoryId ? `<#${settings.categoryId}>` : na,
        inline: true,
      },
      {
        name: "Rôle staff",
        value: settings.staffRoleId ? `<@&${settings.staffRoleId}>` : na,
        inline: true,
      },
      {
        name: "Salon du panneau",
        value: settings.panelChannelId ? `<#${settings.panelChannelId}>` : na,
        inline: true,
      },
      {
        name: "Salon des logs",
        value: settings.logChannelId ? `<#${settings.logChannelId}>` : na,
        inline: true,
      },
      { name: "Tickets max / membre", value: String(settings.maxPerUser), inline: true },
      { name: "Titre du panneau", value: truncate(settings.panelTitle, 100), inline: false },
      {
        name: "Description du panneau",
        value: truncate(settings.panelDescription, 200),
        inline: false,
      },
      {
        name: "Couleur / Émoji",
        value: `\`${settings.panelColor}\` / ${settings.panelEmoji}`,
        inline: true,
      },
      { name: "Nom des salons", value: `\`${settings.nameFormat}\``, inline: true },
      { name: "Message d'ouverture", value: truncate(settings.openMessage, 150), inline: false },
      { name: "Message de fermeture", value: truncate(settings.closeMessage, 150), inline: false }
    );
}

/** Composants principaux du panneau de configuration. */
function mainComponents(settings: TicketSettings) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("tcfg:field")
    .setPlaceholder("Choisir un paramètre à modifier...")
    .addOptions(
      { label: "Catégorie des tickets", value: "category", emoji: "📁" },
      { label: "Rôle staff", value: "staffrole", emoji: "👮" },
      { label: "Salon du panneau", value: "panelchannel", emoji: "📢" },
      { label: "Salon des logs (transcripts)", value: "logchannel", emoji: "📑" },
      { label: "Titre du panneau", value: "title", emoji: "✏️" },
      { label: "Description du panneau", value: "description", emoji: "📝" },
      { label: "Couleur du panneau (#hex)", value: "color", emoji: "🎨" },
      { label: "Émoji du bouton", value: "emoji", emoji: "😀" },
      { label: "Format du nom des salons", value: "nameformat", emoji: "🏷️" },
      { label: "Tickets max par membre", value: "maxperuser", emoji: "🔢" },
      { label: "Message d'ouverture", value: "openmessage", emoji: "👋" },
      { label: "Message de fermeture", value: "closemessage", emoji: "🔒" }
    );
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tcfg:toggle")
      .setLabel(settings.enabled ? "Désactiver" : "Activer")
      .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("tcfg:publish")
      .setLabel("Publier le panneau")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("tcfg:done").setLabel("Terminer").setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}

/** Bouton retour vers le panneau principal. */
function backRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("tcfg:back")
      .setLabel("Retour")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );
}

/** Ouvre un modal texte et attend la soumission (2 minutes). */
async function promptModal(
  interaction: MessageComponentInteraction,
  field: string,
  label: string,
  current: string,
  maxLength: number,
  long: boolean
): Promise<{ value: string; submitted: ModalSubmitInteraction } | null> {
  const modalId = `tcfg:modal:${field}:${interaction.id}`;
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(truncate(label, 45))
    .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(maxLength)
    .setRequired(true);
  if (current) input.setValue(truncate(current, maxLength));

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle("Configuration des tickets")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

  await interaction.showModal(modal);
  const submitted = await interaction
    .awaitModalSubmit({
      time: 120_000,
      filter: (m) => m.customId === modalId && m.user.id === interaction.user.id,
    })
    .catch(() => null);
  if (!submitted) return null;

  const value = submitted.fields.getTextInputValue("value").trim();
  await submitted.deferUpdate().catch(() => null);
  return { value, submitted };
}

const command: Command = {
  name: "ticket",
  category: "Tickets",
  description: "Ouvre le panneau de configuration du système de tickets.",
  usage: "ticket settings",
  level: "TICKETS",
  cooldown: 5,
  run: async (_client, message, args) => {
    if ((args[0] ?? "").toLowerCase() !== "settings") {
      await replyError(message, `Syntaxe : \`${config.prefix}ticket settings\``);
      return;
    }
    if (!message.guild) return;
    const guild = message.guild;

    let settings = await getOrCreateTicketSettings(guild.id);
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

    const handlePublish = async (interaction: ButtonInteraction): Promise<void> => {
      if (!settings.panelChannelId) {
        await interaction
          .reply({
            embeds: [errorEmbed("Définis d'abord le **salon du panneau** dans le menu.")],
            ephemeral: true,
          })
          .catch(() => null);
        return;
      }
      const channel =
        guild.channels.cache.get(settings.panelChannelId) ??
        (await guild.channels.fetch(settings.panelChannelId).catch(() => null));
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction
          .reply({
            embeds: [errorEmbed("Le salon du panneau configuré est introuvable ou invalide.")],
            ephemeral: true,
          })
          .catch(() => null);
        return;
      }

      let color: ColorResolvable = config.colors.primary;
      if (HEX_REGEX.test(settings.panelColor)) color = settings.panelColor as ColorResolvable;
      const panelEmbed = baseEmbed(color)
        .setTitle(truncate(settings.panelTitle, 256))
        .setDescription(truncate(settings.panelDescription, 2000));

      const sent = await (channel as TextChannel)
        .send({ embeds: [panelEmbed], components: [buildPanelRow(settings)] })
        .catch(() => null);
      if (!sent) {
        await interaction
          .reply({
            embeds: [errorEmbed("Impossible d'envoyer le panneau (permissions du salon ?).")],
            ephemeral: true,
          })
          .catch(() => null);
        return;
      }

      settings = await prisma.ticketSettings.update({
        where: { guildId: guild.id },
        data: { panelMessageId: sent.id, enabled: true },
      });
      await interaction
        .update({ embeds: [settingsEmbed(settings)], components: mainComponents(settings) })
        .catch(() => null);
      await interaction
        .followUp({
          embeds: [
            successEmbed(`Panneau publié dans <#${channel.id}> — système de tickets activé.`),
          ],
          ephemeral: true,
        })
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

        // ---- Menu principal : choix du paramètre ----
        if (interaction.isStringSelectMenu() && interaction.customId === "tcfg:field") {
          const field = interaction.values[0];

          if (field === "category" || field === "panelchannel" || field === "logchannel") {
            const channelSelect = new ChannelSelectMenuBuilder()
              .setCustomId(`tcfg:set:${field}`)
              .setPlaceholder("Sélectionne...")
              .setChannelTypes(
                field === "category" ? ChannelType.GuildCategory : ChannelType.GuildText
              );
            await interaction.update({
              components: [
                new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
                backRow(),
              ],
            });
            return;
          }

          if (field === "staffrole") {
            const roleSelect = new RoleSelectMenuBuilder()
              .setCustomId("tcfg:set:staffrole")
              .setPlaceholder("Sélectionne le rôle staff...");
            await interaction.update({
              components: [
                new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
                backRow(),
              ],
            });
            return;
          }

          if (field === "maxperuser") {
            const result = await promptModal(
              interaction,
              field,
              "Tickets max par membre (1 a 10)",
              String(settings.maxPerUser),
              2,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            const parsed = Number.parseInt(result.value, 10);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
              await result.submitted
                .followUp({
                  embeds: [errorEmbed("Valeur invalide : entre un nombre entre 1 et 10.")],
                  ephemeral: true,
                })
                .catch(() => null);
              await refresh();
              return;
            }
            settings = await prisma.ticketSettings.update({
              where: { guildId: guild.id },
              data: { maxPerUser: parsed },
            });
            await refresh();
            return;
          }

          const meta = TEXT_FIELDS[field];
          if (!meta) return;
          const result = await promptModal(
            interaction,
            field,
            meta.label,
            String(settings[meta.key] ?? ""),
            meta.max,
            meta.long
          );
          if (!result) {
            await refresh();
            return;
          }
          if (field === "color" && !HEX_REGEX.test(result.value)) {
            await result.submitted
              .followUp({
                embeds: [
                  errorEmbed("Couleur invalide : format attendu `#RRGGBB` (ex : `#5865F2`)."),
                ],
                ephemeral: true,
              })
              .catch(() => null);
            await refresh();
            return;
          }
          const data: Partial<Record<TextKey, string>> = { [meta.key]: result.value };
          settings = await prisma.ticketSettings.update({
            where: { guildId: guild.id },
            data,
          });
          await refresh();
          return;
        }

        // ---- Sélecteurs de salon (catégorie, panneau, logs) ----
        if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("tcfg:set:")) {
          const field = interaction.customId.split(":")[2];
          const channelId = interaction.values[0];
          const data =
            field === "category"
              ? { categoryId: channelId }
              : field === "panelchannel"
                ? { panelChannelId: channelId }
                : { logChannelId: channelId };
          settings = await prisma.ticketSettings.update({ where: { guildId: guild.id }, data });
          await interaction.update({
            embeds: [settingsEmbed(settings)],
            components: mainComponents(settings),
          });
          return;
        }

        // ---- Sélecteur de rôle staff ----
        if (interaction.isRoleSelectMenu() && interaction.customId === "tcfg:set:staffrole") {
          settings = await prisma.ticketSettings.update({
            where: { guildId: guild.id },
            data: { staffRoleId: interaction.values[0] },
          });
          await interaction.update({
            embeds: [settingsEmbed(settings)],
            components: mainComponents(settings),
          });
          return;
        }

        // ---- Boutons ----
        if (interaction.isButton()) {
          if (interaction.customId === "tcfg:back") {
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "tcfg:toggle") {
            settings = await prisma.ticketSettings.update({
              where: { guildId: guild.id },
              data: { enabled: !settings.enabled },
            });
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "tcfg:done") {
            collector.stop("done");
            await interaction.update({ embeds: [settingsEmbed(settings)], components: [] });
            return;
          }
          if (interaction.customId === "tcfg:publish") {
            await handlePublish(interaction);
            return;
          }
        }
      } catch (error) {
        console.error("[TICKET SETTINGS] Erreur du panneau :", error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ embeds: [errorEmbed("Erreur du panneau, réessaie.")], ephemeral: true })
            .catch(() => null);
        }
      }
    });

    // Interaction expirée : composants désactivés proprement.
    collector.on("end", async () => {
      await panel.edit({ components: [] }).catch(() => null);
    });
  },
};

export default command;
