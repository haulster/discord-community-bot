import { config } from "../../config/config";
import { prisma } from "../../database/client";
import { endGiveaway } from "../../services/giveawayService";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";

const command: Command = {
  name: "end",
  category: "Giveaway",
  description: "Termine immédiatement un giveaway et tire les gagnants.",
  usage: "end giveaway <ID_du_message>",
  level: "GIVEAWAY",
  cooldown: 3,
  run: async (client, message, args) => {
    if (!message.guild) return;

    if ((args[0] ?? "").toLowerCase() !== "giveaway" || !args[1]) {
      await replyError(
        message,
        `Syntaxe : \`${config.prefix}end giveaway <ID_du_message>\`\n` +
          `L'ID est affiché dans le pied de l'embed du giveaway.`
      );
      return;
    }
    const messageId = args[1];

    // Sécurité multi-serveurs : le giveaway doit appartenir à CE serveur.
    const giveaway = await prisma.giveaway.findUnique({ where: { messageId } });
    if (!giveaway || giveaway.guildId !== message.guild.id) {
      await replyError(message, "Aucun giveaway trouvé avec cet ID sur ce serveur.");
      return;
    }

    const result = await endGiveaway(client, messageId, message.author.id);
    if (!result.ok) {
      await replyError(message, result.reason);
      return;
    }
    await replySuccess(
      message,
      `Giveaway terminé : **${result.winnerIds.length}** gagnant(s) tiré(s) parmi **${result.entryCount}** participant(s).`
    );
  },
};

export default command;
