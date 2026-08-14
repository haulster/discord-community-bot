import {
  ChannelType,
  type AttachmentBuilder,
  type EmbedBuilder,
  type Guild,
  type TextChannel,
} from "discord.js";
import { prisma } from "../database/client";

export type LogCategory = "moderation" | "ticket" | "giveaway" | "config";

/** Retrouve le salon de logs configuré pour une catégorie donnée. */
export async function getLogChannel(
  guild: Guild,
  category: LogCategory
): Promise<TextChannel | null> {
  const settings = await prisma.logSettings.findUnique({ where: { guildId: guild.id } });

  let channelId: string | null | undefined;
  switch (category) {
    case "moderation":
      channelId = settings?.moderationChannelId;
      break;
    case "ticket":
      channelId = settings?.ticketChannelId;
      break;
    case "giveaway":
      channelId = settings?.giveawayChannelId;
      break;
    case "config":
      channelId = settings?.configChannelId;
      break;
  }

  // Repli : logs tickets définis dans +ticket settings.
  if (category === "ticket" && !channelId) {
    const ticketSettings = await prisma.ticketSettings.findUnique({
      where: { guildId: guild.id },
    });
    channelId = ticketSettings?.logChannelId ?? undefined;
  }

  if (!channelId) return null;

  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel as TextChannel;
}

/**
 * Envoie un log (embed + fichiers optionnels) dans le salon configuré.
 * Ne throw jamais : un salon de logs supprimé ne doit pas casser une commande.
 */
export async function sendLog(
  guild: Guild,
  category: LogCategory,
  embed: EmbedBuilder,
  files: AttachmentBuilder[] = []
): Promise<void> {
  try {
    const channel = await getLogChannel(guild, category);
    if (!channel) return;
    await channel.send({ embeds: [embed], files });
  } catch (error) {
    console.error(`[LOGS] Échec d'envoi du log "${category}" (guild ${guild.id}) :`, error);
  }
}
