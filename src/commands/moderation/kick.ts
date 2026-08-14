import { PermissionFlagsBits } from "discord.js";
import { config } from "../../config/config";
import { sendLog } from "../../services/logService";
import { checkSanctionTarget, splitTargetsAndReason } from "../../services/moderationService";
import { isBotOwner } from "../../services/ownerService";
import type { Command } from "../../types";
import { baseEmbed, replyError } from "../../utils/embeds";
import { resolveMember } from "../../utils/resolvers";
import { truncate } from "../../utils/text";

const command: Command = {
  name: "kick",
  aliases: ["expulser"],
  category: "Modération",
  description: "Expulse un ou plusieurs membres du serveur.",
  usage: "kick <membre...> [raison]",
  level: "MODERATOR",
  botPermissions: [PermissionFlagsBits.KickMembers],
  cooldown: 3,
  run: async (_client, message, args) => {
    if (!message.guild || !message.member) return;
    const guild = message.guild;

    // Exigence renforcée pour la modération : EN PLUS du niveau interne
    // MODERATOR (déjà vérifié par le dispatcher via permissionService),
    // l'auteur doit posséder la permission Discord réelle correspondante
    // (ou être propriétaire du serveur / owner du bot).
    const authorAllowed =
      message.member.permissions.has(PermissionFlagsBits.KickMembers) ||
      guild.ownerId === message.author.id ||
      (await isBotOwner(message.author.id));
    if (!authorAllowed) {
      await replyError(
        message,
        "Cette commande exige aussi la permission Discord **Expulser des membres**."
      );
      return;
    }

    const { targets, reason } = splitTargetsAndReason(args);
    if (targets.length === 0) {
      await replyError(message, `Syntaxe : \`${config.prefix}kick <membre...> [raison]\``);
      return;
    }
    if (targets.length > 5) {
      await replyError(message, "Maximum **5 membres** par commande.");
      return;
    }

    const successes: string[] = [];
    const failures: string[] = [];

    for (const input of targets) {
      const member = await resolveMember(message, input);
      if (!member) {
        failures.push(`\`${input}\` — membre introuvable`);
        continue;
      }

      const refusal = await checkSanctionTarget(message, member, "kick");
      if (refusal) {
        failures.push(`**${member.user.tag}** — ${refusal}`);
        continue;
      }

      // MP AVANT l'expulsion (impossible après) — DMs fermés : ignoré proprement.
      await member
        .send({
          embeds: [
            baseEmbed(config.colors.error)
              .setTitle(`Tu as été expulsé de ${guild.name}`)
              .setDescription(`**Raison :** ${truncate(reason, 500)}`),
          ],
        })
        .catch(() => null);

      const done = await member
        .kick(`${truncate(reason, 400)} — par ${message.author.tag}`)
        .then(() => true)
        .catch(() => false);
      if (done) successes.push(`**${member.user.tag}** (\`${member.id}\`)`);
      else failures.push(`**${member.user.tag}** — erreur Discord pendant l'expulsion`);
    }

    // Résumé pour le modérateur.
    const summary = baseEmbed(config.colors.warning)
      .setTitle(`👢 Expulsion — ${successes.length} réussie(s), ${failures.length} échec(s)`)
      .addFields({ name: "Raison", value: truncate(reason, 1024), inline: false });
    if (successes.length > 0) {
      summary.addFields({ name: "Expulsés", value: truncate(successes.join("\n"), 1024) });
    }
    if (failures.length > 0) {
      summary.addFields({ name: "Échecs", value: truncate(failures.join("\n"), 1024) });
    }
    await message.reply({ embeds: [summary], allowedMentions: { repliedUser: false } });

    // Log de modération.
    if (successes.length > 0) {
      const logEmbed = baseEmbed(config.colors.warning)
        .setTitle("👢 Expulsion(s)")
        .setDescription(
          [
            `**Membres :**\n${truncate(successes.join("\n"), 2000)}`,
            `**Modérateur :** <@${message.author.id}> (\`${message.author.id}\`)`,
            `**Raison :** ${truncate(reason, 500)}`,
          ].join("\n")
        );
      await sendLog(guild, "moderation", logEmbed);
    }
  },
};

export default command;
