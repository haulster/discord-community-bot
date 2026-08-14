import { rerollGiveaway } from "../../services/giveawayService";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";
import { truncate } from "../../utils/text";

const command: Command = {
  name: "reroll",
  category: "Giveaway",
  description: "Retire un nouveau gagnant sur le dernier giveaway terminé.",
  usage: "reroll",
  level: "GIVEAWAY",
  cooldown: 5,
  run: async (client, message) => {
    if (!message.guild) return;

    const result = await rerollGiveaway(client, message.guild.id);
    if (!result.ok) {
      await replyError(message, result.reason);
      return;
    }
    await replySuccess(
      message,
      `Nouveau gagnant tiré pour **${truncate(result.giveaway.prize, 200)}** : <@${result.winnerId}> !`
    );
  },
};

export default command;
