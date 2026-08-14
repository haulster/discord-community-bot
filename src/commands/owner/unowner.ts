import { config } from "../../config/config";
import { removeBotOwner } from "../../services/ownerService";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";
import { extractUserId } from "../../utils/resolvers";

const command: Command = {
  name: "unowner",
  category: "Owner",
  description: "Retire un owner du bot (Root Owner protégé).",
  usage: "unowner <@membre/ID>",
  level: "OWNER",
  cooldown: 3,
  run: async (_client, message, args) => {
    if (!args[0]) {
      await replyError(message, `Syntaxe : \`${config.prefix}unowner <@membre/ID>\``);
      return;
    }

    const userId = extractUserId(args[0]);
    if (!userId) {
      await replyError(message, "Mention ou ID invalide.");
      return;
    }

    const result = await removeBotOwner(userId);
    if (result === "ROOT") {
      await replyError(
        message,
        `${config.emojis.crown} Le **Root Owner** est protégé : il ne peut jamais être retiré (modifiable uniquement via le fichier .env).`
      );
      return;
    }
    if (result === "NOT_OWNER") {
      await replyError(message, "Cet utilisateur n'est pas owner du bot.");
      return;
    }
    await replySuccess(message, `<@${userId}> n'est plus owner du bot.`);
  },
};

export default command;
