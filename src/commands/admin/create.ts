import { DiscordAPIError, PermissionFlagsBits } from "discord.js";
import { config } from "../../config/config";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";
import { isValidHttpUrl } from "../../utils/resolvers";

const CUSTOM_EMOJI_REGEX = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{15,21})>$/;
const MAX_EMOJI_BYTES = 256 * 1024; // limite Discord : 256 Ko

/** Nom d'émoji valide : 2-32 caractères alphanumériques ou underscore. */
function sanitizeEmojiName(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const name = cleaned.length >= 2 ? cleaned : `emoji_${Date.now() % 100000}`;
  return name.slice(0, 32);
}

const command: Command = {
  name: "create",
  aliases: ["steal"],
  category: "Administration",
  description: "Crée un émoji depuis une image jointe, une URL ou un émoji existant.",
  usage: "create [émoji] [nom]",
  level: "SERVER",
  botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  cooldown: 5,
  run: async (_client, message, args) => {
    if (!message.guild) return;
    const guild = message.guild;

    let sourceUrl: string | null = null;
    let defaultName = "emoji";
    let nameArgs = [...args];

    // Cas 1 : image en pièce jointe.
    const attachment = message.attachments.first();
    if (attachment) {
      if (!attachment.contentType?.startsWith("image/")) {
        await replyError(message, "La pièce jointe doit être une image (png, jpg, gif, webp).");
        return;
      }
      if (attachment.size > MAX_EMOJI_BYTES) {
        await replyError(message, "Image trop lourde : **256 Ko maximum** pour un émoji.");
        return;
      }
      sourceUrl = attachment.url;
      defaultName = attachment.name.replace(/\.[^.]+$/, "");
    } else if (args[0]) {
      // Cas 2 : émoji personnalisé existant <a?:nom:id> (récupéré via le CDN Discord).
      const emojiMatch = args[0].match(CUSTOM_EMOJI_REGEX);
      if (emojiMatch) {
        const animated = emojiMatch[1] === "a";
        sourceUrl = `https://cdn.discordapp.com/emojis/${emojiMatch[3]}.${animated ? "gif" : "png"}`;
        defaultName = emojiMatch[2];
        nameArgs = args.slice(1);
      } else if (isValidHttpUrl(args[0])) {
        // Cas 3 : URL http(s) d'image (validée, aucun autre schéma accepté).
        sourceUrl = args[0];
        nameArgs = args.slice(1);
      }
    }

    if (!sourceUrl) {
      await replyError(
        message,
        `Fournis une image en pièce jointe, un émoji personnalisé ou une URL d'image.\n` +
          `Syntaxe : \`${config.prefix}create [émoji/URL] [nom]\``
      );
      return;
    }

    const name = sanitizeEmojiName(nameArgs.join("_") || defaultName);

    try {
      const emoji = await guild.emojis.create({
        attachment: sourceUrl,
        name,
        reason: `Émoji créé par ${message.author.tag}`,
      });
      await replySuccess(message, `Émoji ${emoji} créé avec le nom \`:${emoji.name}:\`.`);
    } catch (error) {
      if (error instanceof DiscordAPIError) {
        if (error.code === 30008) {
          await replyError(message, "Limite d'émojis du serveur atteinte : supprime-en avant de recommencer.");
          return;
        }
        if (error.code === 50035) {
          await replyError(
            message,
            "Image invalide : format non supporté, dimensions incorrectes ou poids supérieur à 256 Ko."
          );
          return;
        }
        await replyError(message, `Erreur Discord (code \`${error.code}\`) : impossible de créer l'émoji.`);
        return;
      }
      throw error; // erreur inattendue : gérée par le dispatcher
    }
  },
};

export default command;
