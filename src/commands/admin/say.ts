import { PermissionFlagsBits } from "discord.js";
import { config } from "../../config/config";
import type { Command } from "../../types";
import { replyError } from "../../utils/embeds";
import { truncate } from "../../utils/text";

const command: Command = {
  name: "say",
  aliases: ["dire"],
  category: "Administration",
  description: "Fait répéter un message par le bot (supprime ta commande).",
  usage: "say <message>",
  level: "ADMIN",
  botPermissions: [PermissionFlagsBits.ManageMessages],
  cooldown: 3,
  run: async (_client, message) => {
    if (!message.inGuild()) return;

    // On repart du contenu brut pour conserver les sauts de ligne
    // (les args du dispatcher sont découpés sur les espaces).
    const withoutPrefix = message.content.slice(config.prefix.length).trimStart();
    const text = withoutPrefix.replace(/^\S+\s*/, "").trim();
    if (!text) {
      await replyError(message, `Syntaxe : \`${config.prefix}say <message>\``);
      return;
    }

    // Sécurité anti-mention : @everyone/@here et les rôles ne pingent que si
    // l'auteur possède réellement la permission Discord "Mentionner everyone".
    const canMassPing =
      message.member?.permissions.has(PermissionFlagsBits.MentionEveryone) ?? false;

    await message.delete().catch(() => null);
    await message.channel.send({
      content: truncate(text, 2000),
      allowedMentions: canMassPing
        ? { parse: ["users", "roles", "everyone"] }
        : { parse: ["users"] },
    });
  },
};

export default command;
