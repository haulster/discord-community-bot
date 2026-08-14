import { config } from "../../config/config";
import type { Command } from "../../types";
import { baseEmbed, replyError, replyInfo } from "../../utils/embeds";
import { resolveUser } from "../../utils/resolvers";

const command: Command = {
  name: "banner",
  aliases: ["banniere"],
  category: "Utilitaire",
  description: "Affiche la bannière de profil d'un membre (ou la tienne).",
  usage: "banner [membre]",
  level: "USER",
  cooldown: 3,
  run: async (_client, message, args) => {
    const user = await resolveUser(message, args[0]);
    if (!user) {
      await replyError(message, "Utilisateur introuvable (mention, ID ou pseudo exact).");
      return;
    }

    // La bannière n'est disponible qu'après un fetch forcé du profil complet.
    const fetched = await user.fetch(true).catch(() => null);
    if (!fetched) {
      await replyError(message, "Impossible de récupérer le profil de cet utilisateur.");
      return;
    }

    const banner = fetched.bannerURL({ size: 4096 });
    if (!banner) {
      await replyInfo(message, `**${fetched.tag}** n'a pas de bannière de profil.`);
      return;
    }

    const embed = baseEmbed()
      .setTitle(`${config.emojis.member} Bannière de ${fetched.tag}`)
      .setImage(banner);

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};

export default command;
