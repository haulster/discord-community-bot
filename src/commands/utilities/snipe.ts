import { getLastSnipe } from "../../services/snipeService";
import type { Command } from "../../types";
import { baseEmbed, replyInfo } from "../../utils/embeds";
import { truncate } from "../../utils/text";
import { discordTimestamp } from "../../utils/time";

const command: Command = {
  name: "snipe",
  category: "Utilitaire",
  description: "Affiche le dernier message supprimé du salon.",
  usage: "snipe",
  level: "USER",
  cooldown: 3,
  run: async (_client, message) => {
    const snipe = getLastSnipe(message.channelId);
    if (!snipe) {
      await replyInfo(message, "Aucun message supprimé récemment dans ce salon.");
      return;
    }

    const embed = baseEmbed()
      .setAuthor({ name: snipe.authorTag, iconURL: snipe.authorAvatar })
      .setDescription(truncate(snipe.content, 1900) || "*Aucun contenu textuel*")
      .addFields({
        name: "Supprimé",
        value: `${discordTimestamp(snipe.deletedAt, "R")} (envoyé ${discordTimestamp(
          snipe.createdAt,
          "R"
        )})`,
      })
      .setFooter({ text: `Auteur : ${snipe.authorId}` });

    if (snipe.attachments.length > 0) {
      embed.addFields({
        name: "Pièces jointes",
        value: truncate(
          snipe.attachments.map((url, index) => `[Fichier ${index + 1}](${url})`).join(" • "),
          1024
        ),
      });
    }

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};

export default command;
