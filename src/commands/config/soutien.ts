import { ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder } from "discord.js";
import type { SoutienSettings } from "@prisma/client";
import { prisma } from "../../database/client";
import type { Command } from "../../types";
import { baseEmbed, errorEmbed, warnEmbed } from "../../utils/embeds";
import { promptModal } from "../../utils/modals";
import { truncate } from "../../utils/text";

function settingsEmbed(settings: SoutienSettings) {
  return baseEmbed()
    .setTitle("💠 Configuration du soutien")
    .setDescription(
      [
        "Quand le **texte** configuré apparaît dans le **statut personnalisé** d'un membre,",
        "le **rôle** configuré lui est automatiquement attribué (et retiré quand il l'enlève).",
        "",
        "⚠️ Nécessite l'intent **Presence** activé dans le Developer Portal.",
        "Limitation Discord : seul le statut personnalisé est lisible ; les membres",
        "hors-ligne/invisibles sont mis à jour à leur prochain changement de statut.",
      ].join("\n")
    )
    .addFields(
      { name: "Statut", value: settings.enabled ? "✅ Activé" : "❌ Désactivé", inline: true },
      {
        name: "Texte recherché",
        value: settings.text ? `\`${truncate(settings.text, 100)}\`` : "*Non défini*",
        inline: true,
      },
      {
        name: "Rôle attribué",
        value: settings.roleId ? `<@&${settings.roleId}>` : "*Non défini*",
        inline: true,
      }
    );
}

function mainComponents(settings: SoutienSettings) {
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("scfg:role")
    .setPlaceholder("Rôle à attribuer...");
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("scfg:text")
      .setLabel("Définir le texte")
      .setEmoji("✏️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("scfg:toggle")
      .setLabel(settings.enabled ? "Désactiver" : "Activer")
      .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("scfg:done").setLabel("Terminer").setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect), buttons];
}

const command: Command = {
  name: "soutien",
  category: "Configuration",
  description: "Configure le rôle automatique lié au statut personnalisé.",
  usage: "soutien",
  level: "ADMIN",
  cooldown: 5,
  run: async (_client, message) => {
    if (!message.guild) return;
    const guild = message.guild;

    let settings = await prisma.soutienSettings.upsert({
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

        // ---- Sélecteur du rôle ----
        if (interaction.isRoleSelectMenu() && interaction.customId === "scfg:role") {
          const roleId = interaction.values[0];
          if (roleId === guild.id) {
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            await interaction
              .followUp({
                embeds: [errorEmbed("@everyone ne peut pas être utilisé comme rôle de soutien.")],
                ephemeral: true,
              })
              .catch(() => null);
            return;
          }

          settings = await prisma.soutienSettings.update({
            where: { guildId: guild.id },
            data: { roleId },
          });
          await interaction.update({
            embeds: [settingsEmbed(settings)],
            components: mainComponents(settings),
          });

          // Avertissement si le bot ne pourra pas gérer ce rôle.
          const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
          const me = guild.members.me;
          if (role && me && (role.managed || role.position >= me.roles.highest.position)) {
            await interaction
              .followUp({
                embeds: [
                  warnEmbed(
                    "Attention : ce rôle est géré par une intégration ou placé au-dessus de mes rôles — je ne pourrai pas l'attribuer. Monte mon rôle dans les paramètres du serveur."
                  ),
                ],
                ephemeral: true,
              })
              .catch(() => null);
          }
          return;
        }

        // ---- Boutons ----
        if (interaction.isButton()) {
          if (interaction.customId === "scfg:text") {
            const result = await promptModal(
              interaction,
              "scfg",
              "text",
              "Texte à détecter dans le statut",
              settings.text,
              60,
              false
            );
            if (!result) {
              await refresh();
              return;
            }
            settings = await prisma.soutienSettings.update({
              where: { guildId: guild.id },
              data: { text: result.value },
            });
            await refresh();
            return;
          }
          if (interaction.customId === "scfg:toggle") {
            if (!settings.enabled && (!settings.text || !settings.roleId)) {
              await interaction
                .reply({
                  embeds: [errorEmbed("Définis d'abord le **texte** et le **rôle**.")],
                  ephemeral: true,
                })
                .catch(() => null);
              return;
            }
            settings = await prisma.soutienSettings.update({
              where: { guildId: guild.id },
              data: { enabled: !settings.enabled },
            });
            await interaction.update({
              embeds: [settingsEmbed(settings)],
              components: mainComponents(settings),
            });
            return;
          }
          if (interaction.customId === "scfg:done") {
            collector.stop("done");
            await interaction.update({ embeds: [settingsEmbed(settings)], components: [] });
            return;
          }
        }
      } catch (error) {
        console.error("[SOUTIEN] Erreur du panneau :", error);
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
