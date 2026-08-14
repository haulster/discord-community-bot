import { config } from "../../config/config";
import { ASSIGNABLE_LEVELS, LEVEL_LABELS, listPermissions } from "../../services/permissionService";
import type { Command } from "../../types";
import { baseEmbed, replyInfo } from "../../utils/embeds";
import { truncate } from "../../utils/text";

const command: Command = {
  name: "perm",
  aliases: ["perms"],
  category: "Configuration",
  description: "Liste les permissions internes configurées sur le serveur.",
  usage: "perm",
  level: "ADMIN",
  cooldown: 3,
  run: async (_client, message) => {
    if (!message.guild) return;

    const rows = await listPermissions(message.guild.id);
    if (rows.length === 0) {
      await replyInfo(
        message,
        `Aucune permission interne configurée.\nUtilise \`${config.prefix}setperm add <niveau> <@membre/@rôle>\` pour en ajouter.`
      );
      return;
    }

    const embed = baseEmbed()
      .setTitle("⚙️ Permissions internes du serveur")
      .setDescription(
        "Owners du bot, propriétaire du serveur et administrateurs Discord ont toujours accès à tout. Le niveau **Admin** interne donne accès à tous les autres niveaux."
      );

    for (const level of ASSIGNABLE_LEVELS) {
      const entries = rows
        .filter((row) => row.level === level)
        .map((row) => (row.targetType === "ROLE" ? `<@&${row.targetId}>` : `<@${row.targetId}>`));
      if (entries.length === 0) continue;
      embed.addFields({
        name: LEVEL_LABELS[level],
        value: truncate(entries.join(", "), 1024),
        inline: false,
      });
    }

    embed.setFooter({ text: `${rows.length} permission(s) — ${config.prefix}setperm pour modifier` });
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};

export default command;
