import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import type { Giveaway } from "@prisma/client";
import { config } from "../config/config";
import { prisma } from "../database/client";
import type { BotClient } from "../structures/BotClient";
import { baseEmbed } from "../utils/embeds";
import { parseStringArray, truncate } from "../utils/text";
import { discordTimestamp } from "../utils/time";
import { sendLog } from "./logService";

/** Données validées du panneau +giveaway avant création. */
export interface GiveawayDraftData {
  guildId: string;
  channelId: string;
  prize: string;
  winnerCount: number;
  durationMs: number;
  hostId: string;
  requiredRoleId: string | null;
  blockedRoleId: string | null;
  customMessage: string | null;
}

/** Bouton de participation (customId persistant "gw:join", géré dans interactionCreate). */
export function buildJoinRow(disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("gw:join")
      .setLabel("Participer")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
}

/** Embed d'un giveaway actif (participants, fin en timestamp Discord, rôles). */
export function buildGiveawayEmbed(giveaway: Giveaway, entryCount: number): EmbedBuilder {
  const lines: string[] = [];
  if (giveaway.customMessage) lines.push(truncate(giveaway.customMessage, 500), "");
  lines.push(
    `Clique sur le bouton ${config.emojis.giveaway} pour participer !`,
    "",
    `**Fin :** ${discordTimestamp(giveaway.endsAt, "R")} — ${discordTimestamp(giveaway.endsAt, "F")}`,
    `**Organisé par :** <@${giveaway.hostId}>`,
    `**Gagnants :** ${giveaway.winnerCount}`,
    `**Participants :** ${entryCount}`
  );
  if (giveaway.requiredRoleId) lines.push(`**Rôle requis :** <@&${giveaway.requiredRoleId}>`);
  if (giveaway.blockedRoleId) lines.push(`**Rôle interdit :** <@&${giveaway.blockedRoleId}>`);

  return baseEmbed(config.colors.giveaway)
    .setTitle(`${config.emojis.giveaway} ${truncate(giveaway.prize, 240)}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `ID : ${giveaway.messageId}` });
}

/** Récupère le salon textuel d'un giveaway (cache puis API). */
async function fetchGiveawayChannel(
  client: BotClient,
  giveaway: Giveaway
): Promise<TextChannel | null> {
  const guild = client.guilds.cache.get(giveaway.guildId);
  if (!guild) return null;
  const channel =
    guild.channels.cache.get(giveaway.channelId) ??
    (await guild.channels.fetch(giveaway.channelId).catch(() => null));
  return channel && channel.type === ChannelType.GuildText ? (channel as TextChannel) : null;
}

/** Tirage aléatoire de `count` éléments distincts. */
function pickRandom<T>(pool: T[], count: number): T[] {
  const copy = [...pool];
  const picked: T[] = [];
  while (copy.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(index, 1)[0]);
  }
  return picked;
}

/** Crée le giveaway : message, embed, bouton, enregistrement en base. */
export async function createGiveaway(
  client: BotClient,
  draft: GiveawayDraftData
): Promise<Giveaway | null> {
  const guild = client.guilds.cache.get(draft.guildId);
  if (!guild) return null;
  const fetched =
    guild.channels.cache.get(draft.channelId) ??
    (await guild.channels.fetch(draft.channelId).catch(() => null));
  if (!fetched || fetched.type !== ChannelType.GuildText) return null;
  const channel = fetched as TextChannel;

  const message = await channel
    .send({
      embeds: [
        baseEmbed(config.colors.giveaway).setTitle(
          `${config.emojis.giveaway} Préparation du giveaway...`
        ),
      ],
    })
    .catch(() => null);
  if (!message) return null;

  const giveaway = await prisma.giveaway.create({
    data: {
      messageId: message.id,
      guildId: draft.guildId,
      channelId: channel.id,
      prize: draft.prize,
      winnerCount: draft.winnerCount,
      endsAt: new Date(Date.now() + draft.durationMs),
      hostId: draft.hostId,
      requiredRoleId: draft.requiredRoleId,
      blockedRoleId: draft.blockedRoleId,
      customMessage: draft.customMessage,
    },
  });

  await message
    .edit({ embeds: [buildGiveawayEmbed(giveaway, 0)], components: [buildJoinRow(false)] })
    .catch(() => null);
  return giveaway;
}

/** Rafraîchit l'embed du giveaway (compteur de participants). */
export async function refreshGiveawayMessage(
  client: BotClient,
  giveaway: Giveaway,
  entryCount: number
): Promise<void> {
  const channel = await fetchGiveawayChannel(client, giveaway);
  if (!channel) return;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) return;
  await message
    .edit({ embeds: [buildGiveawayEmbed(giveaway, entryCount)], components: [buildJoinRow(false)] })
    .catch(() => null);
}

export type EntryResult =
  | { status: "JOINED" | "LEFT"; count: number }
  | { status: "ERROR"; reason: string };

/** Ajoute/retire la participation d'un membre, avec contrôle des rôles requis/interdits. */
export async function toggleEntry(giveaway: Giveaway, member: GuildMember): Promise<EntryResult> {
  if (giveaway.status !== "ACTIVE" || giveaway.endsAt.getTime() <= Date.now()) {
    return { status: "ERROR", reason: "Ce giveaway est terminé." };
  }
  if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) {
    return {
      status: "ERROR",
      reason: `Tu dois avoir le rôle <@&${giveaway.requiredRoleId}> pour participer.`,
    };
  }
  if (giveaway.blockedRoleId && member.roles.cache.has(giveaway.blockedRoleId)) {
    return {
      status: "ERROR",
      reason: `Les membres avec le rôle <@&${giveaway.blockedRoleId}> ne peuvent pas participer.`,
    };
  }

  const existing = await prisma.giveawayEntry.findUnique({
    where: { giveawayId_userId: { giveawayId: giveaway.messageId, userId: member.id } },
  });
  if (existing) {
    await prisma.giveawayEntry.delete({ where: { id: existing.id } });
  } else {
    await prisma.giveawayEntry.create({
      data: { giveawayId: giveaway.messageId, userId: member.id },
    });
  }
  const count = await prisma.giveawayEntry.count({ where: { giveawayId: giveaway.messageId } });
  return { status: existing ? "LEFT" : "JOINED", count };
}

export type EndResult =
  | { ok: true; giveaway: Giveaway; winnerIds: string[]; entryCount: number }
  | { ok: false; reason: string };

/**
 * Termine un giveaway : tirage, mise à jour BDD, édition du message,
 * annonce des gagnants et log. Utilisé par le scheduler ET par +end giveaway.
 */
export async function endGiveaway(
  client: BotClient,
  messageId: string,
  endedByUserId?: string
): Promise<EndResult> {
  const giveaway = await prisma.giveaway.findUnique({
    where: { messageId },
    include: { entries: true },
  });
  if (!giveaway) return { ok: false, reason: "Aucun giveaway trouvé avec cet ID de message." };
  if (giveaway.status !== "ACTIVE") return { ok: false, reason: "Ce giveaway est déjà terminé." };

  const entryIds = giveaway.entries.map((entry) => entry.userId);
  const winnerIds = pickRandom(entryIds, giveaway.winnerCount);

  const updated = await prisma.giveaway.update({
    where: { messageId },
    data: { status: "ENDED", endedAt: new Date(), winnersJson: JSON.stringify(winnerIds) },
  });

  const guild = client.guilds.cache.get(giveaway.guildId);
  const channel = await fetchGiveawayChannel(client, giveaway);
  const winnersText =
    winnerIds.length > 0 ? winnerIds.map((id) => `<@${id}>`).join(", ") : "Aucun participant";

  if (channel) {
    // Édite le message d'origine (bouton désactivé, embed "terminé").
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      const endedEmbed = baseEmbed(config.colors.giveaway)
        .setTitle(`${config.emojis.giveaway} ${truncate(giveaway.prize, 240)}`)
        .setDescription(
          [
            `**Giveaway terminé** ${discordTimestamp(new Date(), "R")}`,
            `**Gagnant(s) :** ${winnersText}`,
            `**Participants :** ${entryIds.length}`,
            `**Organisé par :** <@${giveaway.hostId}>`,
          ].join("\n")
        )
        .setFooter({ text: `ID : ${messageId}` });
      await message
        .edit({ embeds: [endedEmbed], components: [buildJoinRow(true)] })
        .catch(() => null);
    }

    // Annonce dans le salon.
    if (winnerIds.length > 0) {
      await channel
        .send({
          content: `${config.emojis.giveaway} Félicitations ${winnerIds
            .map((id) => `<@${id}>`)
            .join(", ")} ! Vous remportez **${truncate(giveaway.prize, 200)}** !`,
          allowedMentions: { users: winnerIds },
        })
        .catch(() => null);
    } else {
      await channel
        .send({
          content: `${config.emojis.giveaway} Giveaway **${truncate(
            giveaway.prize,
            200
          )}** terminé sans aucun participant valide.`,
        })
        .catch(() => null);
    }
  }

  if (guild) {
    const logEmbed = baseEmbed(config.colors.giveaway)
      .setTitle(`${config.emojis.giveaway} Giveaway terminé`)
      .setDescription(
        [
          `**Récompense :** ${truncate(giveaway.prize, 200)}`,
          `**Gagnant(s) :** ${winnersText}`,
          `**Participants :** ${entryIds.length}`,
          `**Organisateur :** <@${giveaway.hostId}> (\`${giveaway.hostId}\`)`,
          endedByUserId
            ? `**Terminé manuellement par :** <@${endedByUserId}> (\`${endedByUserId}\`)`
            : "**Fin :** automatique (date atteinte)",
          `**Salon :** <#${giveaway.channelId}> — **Message :** \`${messageId}\``,
        ].join("\n")
      );
    await sendLog(guild, "giveaway", logEmbed);
  }

  return { ok: true, giveaway: updated, winnerIds, entryCount: entryIds.length };
}

export type RerollResult =
  | { ok: true; giveaway: Giveaway; winnerId: string }
  | { ok: false; reason: string };

/**
 * Reroll : nouveau tirage sur le DERNIER giveaway terminé du serveur.
 * Évite de reprendre un gagnant précédent tant qu'il reste d'autres participants.
 */
export async function rerollGiveaway(client: BotClient, guildId: string): Promise<RerollResult> {
  const giveaway = await prisma.giveaway.findFirst({
    where: { guildId, status: "ENDED" },
    orderBy: { endedAt: "desc" },
    include: { entries: true },
  });
  if (!giveaway) return { ok: false, reason: "Aucun giveaway terminé trouvé sur ce serveur." };
  if (giveaway.entries.length === 0) {
    return { ok: false, reason: "Ce giveaway n'avait aucun participant : reroll impossible." };
  }

  const previousWinners = parseStringArray(giveaway.winnersJson);
  let pool = giveaway.entries
    .map((entry) => entry.userId)
    .filter((id) => !previousWinners.includes(id));
  if (pool.length === 0) pool = giveaway.entries.map((entry) => entry.userId);

  const winnerId = pickRandom(pool, 1)[0];
  const updated = await prisma.giveaway.update({
    where: { messageId: giveaway.messageId },
    data: { winnersJson: JSON.stringify([...new Set([...previousWinners, winnerId])]) },
  });

  const channel = await fetchGiveawayChannel(client, giveaway);
  if (channel) {
    await channel
      .send({
        content: `${config.emojis.giveaway} Reroll ! Nouveau gagnant pour **${truncate(
          giveaway.prize,
          200
        )}** : <@${winnerId}> — félicitations !`,
        allowedMentions: { users: [winnerId] },
      })
      .catch(() => null);
  }

  const guild = client.guilds.cache.get(guildId);
  if (guild) {
    const logEmbed = baseEmbed(config.colors.giveaway)
      .setTitle(`${config.emojis.giveaway} Reroll effectué`)
      .setDescription(
        [
          `**Récompense :** ${truncate(giveaway.prize, 200)}`,
          `**Nouveau gagnant :** <@${winnerId}> (\`${winnerId}\`)`,
          `**Message :** \`${giveaway.messageId}\``,
        ].join("\n")
      );
    await sendLog(guild, "giveaway", logEmbed);
  }

  return { ok: true, giveaway: updated, winnerId };
}
