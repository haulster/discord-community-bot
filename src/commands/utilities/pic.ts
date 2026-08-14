import { config } from "../../config/config";
import type { Command } from "../../types";
import { baseEmbed, replyError } from "../../utils/embeds";
import { resolveUser } from "../../utils/resolvers";

const command: Command = {
  name: "pic",
  aliases: ["avatar", "pdp"],
  category: "Utilitaire",
  description: "Affiche la photo de profil d'un membre (ou la tienne).",
  usage: "pic [membre]",
  level: "USER",
  cooldown: 3,
  run: async (_client, message, args) => {
    const user = await resolveUser(message, args[0]);
    if (!user) {
      await replyError(message, "Utilisateur introuvable (mention, ID ou pseudo exact).");
      return;
    }

    const dynamic = user.displayAvatarURL({ size: 4096 });
    const png = user.displayAvatarURL({ extension: "png", size: 4096, forceStatic: true });
    const jpg = user.displayAvatarURL({ extension: "jpg", size: 4096, forceStatic: true });
    const webp = user.displayAvatarURL({ extension: "webp", size: 4096, forceStatic: true });

    const embed = baseEmbed()
      .setTitle(`${config.emojis.member} Avatar de ${user.tag}`)
      .setDescription(`[PNG](${png}) • [JPG](${jpg}) • [WEBP](${webp})`)
      .setImage(dynamic);

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};

export default command;
