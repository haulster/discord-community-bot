import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { config } from "../../config/config";
import { createGiveaway } from "../../services/giveawayService";
import type { Command } from "../../types";
import { baseEmbed, errorEmbed, infoEmbed, successEmbed } from "../../utils/embeds";
import { promptModal } from "../../utils/modals";
import { truncate } from "../../utils/text";
import { discordTimestamp, formatDuration, parseDuration } from "../../utils/time";

interface GiveawayDraft {
  prize: string | null;
  durationMs: number | null;
  winnerCount: number;
  channelId: string;
  requiredRoleId: string | null;
  blockedRoleId: string | null;
  customMessage: string | null;
}

function draftEmbed(draft: GiveawayDraft) {
  const na = "*À définir*";
  const none = "*Aucun*";
  return baseEmbed(config.colors.giveaway)
    .setTitle(`${config.emojis.giveaway} Création d'un giveaway`)
    .setDescription("Configure les champs via le menu, puis clique sur **Lancer le giveaway**.")
    .addFields(
      { name: "Récompense *", value: draft.prize ? truncate(draft.prize, 200) : na, inline: false },
      {
        name: "Durée *",
        value: draft.durationMs ? formatDuration(draft.durationMs) : na,
        inline: true,
      },
      { name: "Gagnants", value: String(draft.winnerCount), inline: true },
      { name: "Salon", value: `<#${draft.channelId}>`, inline: true },
      {
        name: "Rôle requis",
        value: draft.requiredRoleId ? `<@&${draft.requiredRoleId}>` : none,
        inline: true,
      },
      {
        name: "Rôle interdit",
        value: draft.blockedRoleId ? `<@&${draft.blockedRoleId}>` : none,
        inline: true,
      },
      {
        name: "Message personnalisé",
        value: draft.customMessage ? truncate(draft.customMessage, 200) : none,
        inline: false,
      }
    )
    .setFooter({ text: "* champs obligatoires" });
}

function mainComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("gwcfg:field")
    .setPlaceholder("Configurer le giveaway...")
    .addOptions(
      { label: "Récompense (obligatoire)", value: "prize", emoji: "🎁" },
      { label: "Durée (obligatoire)", value: "duration", emoji: "⏱️" },
      { label: "Nombre de gagnants", value: "winners", emoji: "🏆" },
      { label: "Salon d'envoi", value: "channel", emoji: "📢" },
      { label: "Rôle requis", value: "requiredrole", emoji: "✅" },
      { label: "Rôle interdit", value: "blockedrole", emoji: "🚫" },
      { label: "Message personnalisé", value: "custommessage", emoji: "📝" }
    );
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("gwcfg:launch")
      .setLabel("Lancer le giveaway")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("gwcfg:cancel").setLabel("Annuler").setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}

function backRow(extra?: ButtonBuilder): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("gwcfg:back")
      .setLabel("Retour")
      .setEmoji("↩️")
      .setStyle(ButtonStyle.Secondary)
  );
  if (extra) row.addComponents(extra);
  return row;
}

const command: Command = {
  name: "giveaway",
  aliases: ["gw"],
  category: "Giveaway",
  description: "Ouvre le panneau interactif de création d'un giveaway.",
  usage: "giveaway",
  level: "GIVEAWAY",
  cooldown: 5,
  run: async (client, message) => {
    if (!message.guild) return;
    const guild = message.guild;

    const draft: GiveawayDraft = {
      prize: null,
      durationMs: null,
      winnerCount: 1,
      channelId: message.channelId,
      requiredRoleId: null,
      blockedRoleId: null,
      customMessage: null,
    };

    const panel = await message.reply({
      embeds: [draftEmbed(draft)],
      components: mainComponents(),
      allowedMentions: { repliedUser: false },
    });

    const refresh = async (): Promise<void> => {
      await panel.edit({ embeds: [draftEmbed(draft)], components: mainComponents() }).catch(() => null);
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
        if (interaction.isStringSelectMenu() && interaction.customId === "gwcfg:field") {
          const field = interaction.values[0];

          if (field === "channel") {
            const channelSelect = new ChannelSelectMenuBuilder()
              .setCustomId("gwcfg:set:channel")
              .setPlaceholder("Salon où envoyer le giveaway...")
              .setChannelTypes(ChannelType.GuildText);
            await interaction.update({
              components: [
                new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect),
                backRow(),
              ],
            });
            return;
          }

          if (field === "requiredrole" || field === "blockedrole") {
            const roleSelect = new RoleSelectMenuBuilder()
              .setCustomId(`gwcfg:set:${field}`)
              .setPlaceholder(field === "requiredrole" ? "Rôle requis..." : "Rôle interdit...");
            const clear = new ButtonBuilder()
              .setCustomId(`gwcfg:clear:${field}`)
              .setLabel("Retirer le rôle")
              .setStyle(ButtonStyle.Danger);
            await interaction.update({
              components: [
                new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
                backRow(clear),
              ],
            });
            return;
          }

          if (field === "prize") {
            const result = await promptModal(
              interaction,
              "gwcfg",
              field,
              "Récompense du giveaway",
              draft.prize ?? "",
              250,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            draft.prize = result.value;
            await refresh();
            return;
          }

          if (field === "duration") {
            const result = await promptModal(
              interaction,
              "gwcfg",
              field,
              "Durée (ex : 1h30m, 2d, 45)",
              "",
              20,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            const ms = parseDuration(result.value);
            if (ms === null || ms < 60_000) {
              await result.submitted
                .followUp({
                  embeds: [
                    errorEmbed("Durée invalide (minimum 1 minute). Exemples : `30m`, `1h30m`, `2d`."),
                  ],
                  ephemeral: true,
                })
                .catch(() => null);
              await refresh();
              return;
            }
            if (ms > config.limits.giveawayMaxDurationMs) {
              await result.submitted
                .followUp({
                  embeds: [
                    errorEmbed(
                      `Durée maximale : **${formatDuration(config.limits.giveawayMaxDurationMs)}**.`
                    ),
                  ],
                  ephemeral: true,
                })
                .catch(() => null);
              await refresh();
              return;
            }
            draft.durationMs = ms;
            await refresh();
            return;
          }

          if (field === "winners") {
            const result = await promptModal(
              interaction,
              "gwcfg",
              field,
              "Nombre de gagnants (1 à 20)",
              String(draft.winnerCount),
              2,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            const parsed = Number.parseInt(result.value, 10);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
              await result.submitted
                .followUp({
                  embeds: [errorEmbed("Valeur invalide : entre un nombre entre 1 et 20.")],
                  ephemeral: true,
                })
                .catch(() => null);
              await refresh();
              return;
            }
            draft.winnerCount = parsed;
            await refresh();
            return;
          }

          if (field === "custommessage") {
            const result = await promptModal(
              interaction,
              "gwcfg",
              field,
              "Message personnalisé (vide = aucun)",
              draft.customMessage ?? "",
              500,
              true,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            draft.customMessage = result.value || null;
            await refresh();
            return;
          }
          return;
        }

        // ---- Sélecteur de salon ----
        if (interaction.isChannelSelectMenu() && interaction.customId === "gwcfg:set:channel") {
          draft.channelId = interaction.values[0];
          await interaction.update({ embeds: [draftEmbed(draft)], components: mainComponents() });
          return;
        }

        // ---- Sélecteurs de rôles (requis / interdit) ----
        if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("gwcfg:set:")) {
          const field = interaction.customId.split(":")[2];
          const roleId = interaction.values[0];

          if (roleId === guild.id) {
            await interaction.update({ embeds: [draftEmbed(draft)], components: mainComponents() });
            await interaction
              .followUp({
                embeds: [errorEmbed("@everyone ne peut pas être utilisé ici.")],
                ephemeral: true,
              })
              .catch(() => null);
            return;
          }
          const conflict =
            (field === "requiredrole" && draft.blockedRoleId === roleId) ||
            (field === "blockedrole" && draft.requiredRoleId === roleId);
          if (conflict) {
            await interaction.update({ embeds: [draftEmbed(draft)], components: mainComponents() });
            await interaction
              .followUp({
                embeds: [errorEmbed("Le même rôle ne peut pas être requis ET interdit.")],
                ephemeral: true,
              })
              .catch(() => null);
            return;
          }

          if (field === "requiredrole") draft.requiredRoleId = roleId;
          else if (field === "blockedrole") draft.blockedRoleId = roleId;
          await interaction.update({ embeds: [draftEmbed(draft)], components: mainComponents() });
          return;
        }

        // ---- Boutons ----
        if (interaction.isButton()) {
          if (interaction.customId === "gwcfg:back") {
            await interaction.update({ embeds: [draftEmbed(draft)], components: mainComponents() });
            return;
          }
          if (interaction.customId.startsWith("gwcfg:clear:")) {
            const field = interaction.customId.split(":")[2];
            if (field === "requiredrole") draft.requiredRoleId = null;
            else if (field === "blockedrole") draft.blockedRoleId = null;
            await interaction.update({ embeds: [draftEmbed(draft)], components: mainComponents() });
            return;
          }
          if (interaction.customId === "gwcfg:cancel") {
            collector.stop("cancel");
            await interaction.update({
              embeds: [infoEmbed("Création du giveaway annulée.")],
              components: [],
            });
            return;
          }
          if (interaction.customId === "gwcfg:launch") {
            if (!draft.prize) {
              await interaction
                .reply({
                  embeds: [errorEmbed("Définis d'abord la **récompense**.")],
                  ephemeral: true,
                })
                .catch(() => null);
              return;
            }
            if (!draft.durationMs) {
              await interaction
                .reply({ embeds: [errorEmbed("Définis d'abord la **durée**.")], ephemeral: true })
                .catch(() => null);
              return;
            }

            await interaction.deferUpdate().catch(() => null);
            const giveaway = await createGiveaway(client, {
              guildId: guild.id,
              channelId: draft.channelId,
              prize: draft.prize,
              winnerCount: draft.winnerCount,
              durationMs: draft.durationMs,
              hostId: message.author.id,
              requiredRoleId: draft.requiredRoleId,
              blockedRoleId: draft.blockedRoleId,
              customMessage: draft.customMessage,
            });
            if (!giveaway) {
              await interaction
                .followUp({
                  embeds: [
                    errorEmbed(
                      `Impossible d'envoyer le giveaway dans <#${draft.channelId}> (salon invalide ou permissions manquantes). Choisis un autre salon.`
                    ),
                  ],
                  ephemeral: true,
                })
                .catch(() => null);
              return;
            }

            collector.stop("launched");
            await panel
              .edit({
                embeds: [
                  successEmbed(
                    `${config.emojis.giveaway} Giveaway lancé dans <#${giveaway.channelId}> !\n` +
                      `**ID :** \`${giveaway.messageId}\` (pour \`${config.prefix}end giveaway <ID>\`)\n` +
                      `**Fin :** ${discordTimestamp(giveaway.endsAt, "F")}`
                  ),
                ],
                components: [],
              })
              .catch(() => null);
            return;
          }
        }
      } catch (error) {
        console.error("[GIVEAWAY PANEL] Erreur :", error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction
            .reply({ embeds: [errorEmbed("Erreur du panneau, réessaie.")], ephemeral: true })
            .catch(() => null);
        }
      }
    });

    collector.on("end", async (_collected, reason) => {
      if (reason !== "cancel" && reason !== "launched") {
        await panel.edit({ components: [] }).catch(() => null);
      }
    });
  },
};

export default command;
