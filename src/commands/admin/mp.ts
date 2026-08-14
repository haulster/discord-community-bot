import { config } from "../../config/config";
import type { Command } from "../../types";
import { baseEmbed, replyError, replySuccess } from "../../utils/embeds";
import { resolveUser } from "../../utils/resolvers";
import { truncate } from "../../utils/text";

const command: Command = {
  name: "mp",
  aliases: ["dm"],
  category: "Administration",
  description: "Envoie un message privé à un membre via le bot.",
  usage: "mp <membre> <message>",
  level: "ADMIN",
  cooldown: 5,
  run: async (_client, message, args) => {
    if (!args[0] || !args[1]) {
      await replyError(message, `Syntaxe : \`${config.prefix}mp <membre> <message>\``);
      return;
    }

    // Une seule cible par commande : pas d'envoi de masse (anti-abus).
    const user = await resolveUser(message, args[0]);
    if (!user) {
      await replyError(message, "Utilisateur introuvable (mention, ID ou pseudo exact).");
      return;
    }
    if (user.bot) {
      await replyError(message, "Impossible d'envoyer un MP à un bot.");
      return;
    }

    // Contenu brut pour conserver les sauts de ligne : on retire la commande
    // puis le premier argument (la cible).
    const withoutPrefix = message.content.slice(config.prefix.length).trimStart();
    const afterCommand = withoutPrefix.replace(/^\S+\s*/, "");
    const content = afterCommand.replace(/^\S+\s*/, "").trim();
    if (!content) {
      await replyError(message, `Syntaxe : \`${config.prefix}mp <membre> <message>\``);
      return;
    }

    // Transparence : le MP indique le serveur et l'expéditeur (pas d'anonymat).
    const embed = baseEmbed()
      .setTitle(`📩 Message de l'équipe de ${message.guild?.name ?? "un serveur"}`)
      .setDescription(truncate(content, 1900))
      .setFooter({ text: `Envoyé par ${message.author.tag}` });

    const sent = await user.send({ embeds: [embed] }).catch(() => null);
    if (!sent) {
      await replyError(
        message,
        `Impossible d'envoyer le MP à **${user.tag}** (messages privés fermés ou bot bloqué).`
      );
      return;
    }
    await replySuccess(message, `Message privé envoyé à **${user.tag}**.`);
  },
};

export default command;
