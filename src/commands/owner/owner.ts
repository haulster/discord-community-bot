import { config } from "../../config/config";
import { addBotOwner, isRootOwner, listBotOwners } from "../../services/ownerService";
import type { Command } from "../../types";
import { baseEmbed, replyError, replyInfo, replySuccess } from "../../utils/embeds";
import { resolveUser } from "../../utils/resolvers";
import { truncate } from "../../utils/text";

const command: Command = {
  name: "owner",
  category: "Owner",
  description: "Ajoute un owner du bot, ou liste les owners actuels.",
  usage: "owner [@membre/ID]",
  level: "OWNER",
  cooldown: 3,
  run: async (_client, message, args) => {
    // ---- Sans argument : liste des owners (Root Owner + owners en base) ----
    if (!args[0]) {
      const owners = await listBotOwners();
      const lines = [
        `${config.emojis.crown} <@${config.rootOwnerId}> (\`${config.rootOwnerId}\`) — **Root Owner** (protégé, défini dans .env)`,
      ];
      for (const owner of owners) {
        lines.push(`${config.emojis.member} <@${owner.userId}> (\`${owner.userId}\`)`);
      }

      const embed = baseEmbed()
        .setTitle(`${config.emojis.crown} Owners du bot`)
        .setDescription(truncate(lines.join("\n"), 3900))
        .setFooter({ text: `${owners.length + 1} owner(s) — accès complet sur tous les serveurs` });
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      return;
    }

    // ---- Avec argument : ajout d'un owner ----
    const user = await resolveUser(message, args[0]);
    if (!user) {
      await replyError(message, "Utilisateur introuvable (mention ou ID).");
      return;
    }
    if (user.bot) {
      await replyError(message, "Un bot ne peut pas être owner.");
      return;
    }
    if (isRootOwner(user.id)) {
      await replyInfo(message, `**${user.tag}** est déjà le Root Owner.`);
      return;
    }

    const added = await addBotOwner(user.id, message.author.id);
    if (!added) {
      await replyInfo(message, `**${user.tag}** est déjà owner du bot.`);
      return;
    }
    await replySuccess(
      message,
      `**${user.tag}** est maintenant owner du bot (accès complet, persistant en base de données).`
    );
  },
};

export default command;
