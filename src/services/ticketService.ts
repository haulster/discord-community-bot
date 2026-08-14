import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type Message,
  type OverwriteResolvable,
  type TextChannel,
  type User,
} from "discord.js";
import type { Ticket, TicketSettings } from "@prisma/client";
import { config } from "../config/config";
import { prisma } from "../database/client";
import { baseEmbed } from "../utils/embeds";
import { applyVariables, escapeHtml, truncate } from "../utils/text";
import { sendLog } from "./logService";

/** Lit les paramètres tickets du serveur (créés avec les valeurs par défaut au besoin). */
export async function getOrCreateTicketSettings(guildId: string): Promise<TicketSettings> {
  return prisma.ticketSettings.upsert({
    where: { guildId },
    update: {},
    create: { guildId },
  });
}

/** Retrouve le ticket associé à un salon. */
export async function findTicketByChannel(channelId: string): Promise<Ticket | null> {
  return prisma.ticket.findUnique({ where: { channelId } });
}

/** Nettoie un nom de salon (minuscules, sans accents ni caractères invalides). */
export function sanitizeChannelName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (cleaned || "ticket").slice(0, 95);
}

/** Construit le nom du salon depuis le format configuré ({username}, {number}, {userId}). */
export function buildTicketChannelName(
  settings: TicketSettings,
  user: User,
  number: number
): string {
  const raw = settings.nameFormat
    .replace(/\{username\}/g, user.username)
    .replace(/\{number\}/g, String(number))
    .replace(/\{userId\}/g, user.id);
  return sanitizeChannelName(raw);
}

/** Bouton persistant de fermeture placé dans le message d'ouverture du ticket. */
function buildCloseRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:close")
      .setLabel("Fermer le ticket")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );
}

/** Bouton persistant d'ouverture placé sous le panneau publié. */
export function buildPanelRow(settings: TicketSettings): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId("ticket:create")
    .setLabel("Ouvrir un ticket")
    .setStyle(ButtonStyle.Primary);
  try {
    button.setEmoji(settings.panelEmoji);
  } catch {
    button.setEmoji("🎫");
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export type CreateTicketResult =
  | { ok: true; ticket: Ticket; channel: TextChannel }
  | { ok: false; reason: string };

/**
 * Crée un ticket : salon privé (membre + staff + bot), numérotation,
 * message d'ouverture avec bouton de fermeture, log.
 */
export async function createTicket(guild: Guild, user: User): Promise<CreateTicketResult> {
  const settings = await prisma.ticketSettings.findUnique({ where: { guildId: guild.id } });
  if (!settings?.enabled) {
    return { ok: false, reason: "Le système de tickets n'est pas activé sur ce serveur." };
  }

  // Limite de tickets ouverts simultanément par membre.
  const openCount = await prisma.ticket.count({
    where: { guildId: guild.id, userId: user.id, status: "OPEN" },
  });
  if (openCount >= settings.maxPerUser) {
    return {
      ok: false,
      reason: `Tu as déjà ${openCount} ticket(s) ouvert(s) (maximum : ${settings.maxPerUser}).`,
    };
  }

  // Numéro incrémental par serveur.
  const last = await prisma.ticket.findFirst({
    where: { guildId: guild.id },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const number = (last?.number ?? 0) + 1;

  // Catégorie parente si configurée et toujours valide.
  let parentId: string | undefined;
  if (settings.categoryId) {
    const parent =
      guild.channels.cache.get(settings.categoryId) ??
      (await guild.channels.fetch(settings.categoryId).catch(() => null));
    if (parent && parent.type === ChannelType.GuildCategory) parentId = parent.id;
  }

  // Salon privé : @everyone refusé, membre + staff + bot autorisés.
  const me = guild.members.me;
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];
  if (settings.staffRoleId && guild.roles.cache.has(settings.staffRoleId)) {
    overwrites.push({
      id: settings.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }
  if (me) {
    overwrites.push({
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  const channel = await guild.channels
    .create({
      name: buildTicketChannelName(settings, user, number),
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites: overwrites,
      topic: `Ticket #${number} — ouvert par ${user.tag} (${user.id})`,
      reason: `Ticket #${number} ouvert par ${user.tag}`,
    })
    .catch(() => null);
  if (!channel) {
    return {
      ok: false,
      reason:
        "Impossible de créer le salon du ticket. Vérifie mes permissions (Gérer les salons).",
    };
  }

  const ticket = await prisma.ticket.create({
    data: { guildId: guild.id, channelId: channel.id, userId: user.id, number },
  });

  // Message d'ouverture (variables + bouton de fermeture persistant).
  const openText = truncate(applyVariables(settings.openMessage, { user, guild }), 1900);
  const embed = baseEmbed(config.colors.primary)
    .setTitle(`${config.emojis.ticket} Ticket #${number}`)
    .setDescription(openText)
    .setFooter({ text: `Ouvert par ${user.tag}` });
  await channel
    .send({
      content: settings.staffRoleId
        ? `<@${user.id}> — <@&${settings.staffRoleId}>`
        : `<@${user.id}>`,
      embeds: [embed],
      components: [buildCloseRow()],
      allowedMentions: settings.staffRoleId
        ? { users: [user.id], roles: [settings.staffRoleId] }
        : { users: [user.id] },
    })
    .catch(() => null);

  // Log d'ouverture.
  const logEmbed = baseEmbed(config.colors.info)
    .setTitle(`${config.emojis.ticket} Ticket ouvert`)
    .setDescription(
      [
        `**Ticket :** #${number} (<#${channel.id}>)`,
        `**Membre :** <@${user.id}> (\`${user.id}\`)`,
      ].join("\n")
    );
  await sendLog(guild, "ticket", logEmbed);

  return { ok: true, ticket, channel };
}

/** Génère un transcript HTML (jusqu'à config.limits.transcriptMaxMessages messages). */
async function generateTranscript(channel: TextChannel, ticket: Ticket): Promise<AttachmentBuilder> {
  const limit = config.limits.transcriptMaxMessages;
  const collected: Message[] = [];
  let before: string | undefined;

  while (collected.length < limit) {
    const batch = await channel.messages
      .fetch({ limit: Math.min(100, limit - collected.length), before })
      .catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  collected.reverse(); // ordre chronologique

  const rows = collected
    .map((msg) => {
      const time = msg.createdAt.toLocaleString("fr-FR");
      const author = escapeHtml(msg.author.tag) + (msg.author.bot ? " [BOT]" : "");
      const content = escapeHtml(msg.content || "");
      const attachments = [...msg.attachments.values()]
        .map(
          (a) =>
            `<div class="attachment"><a href="${escapeHtml(a.url)}">📎 ${escapeHtml(a.name)}</a></div>`
        )
        .join("");
      const embedNote =
        msg.embeds.length > 0
          ? `<div class="embed-note">[${msg.embeds.length} embed(s)]</div>`
          : "";
      return `<div class="message"><div class="meta"><span class="author">${author}</span><span class="time">${time}</span></div><div class="content">${content}</div>${attachments}${embedNote}</div>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Transcript — Ticket #${ticket.number}</title>
<style>
  body { background:#313338; color:#dbdee1; font-family:'Segoe UI',Arial,sans-serif; margin:0; padding:24px; }
  .header { border-bottom:1px solid #3f4147; padding-bottom:16px; margin-bottom:16px; }
  .header h1 { margin:0 0 4px 0; font-size:20px; color:#ffffff; }
  .header p { margin:2px 0; font-size:13px; color:#949ba4; }
  .message { padding:8px 0; border-bottom:1px solid #2b2d31; }
  .meta { margin-bottom:2px; }
  .author { font-weight:600; color:#f2f3f5; margin-right:8px; }
  .time { font-size:12px; color:#949ba4; }
  .content { white-space:pre-wrap; word-break:break-word; font-size:14px; }
  .attachment { font-size:13px; margin-top:4px; }
  .attachment a { color:#00a8fc; }
  .embed-note { font-size:12px; color:#949ba4; font-style:italic; margin-top:2px; }
</style>
</head>
<body>
<div class="header">
  <h1>Transcript — Ticket #${ticket.number}</h1>
  <p>Serveur : ${escapeHtml(channel.guild.name)} — Salon : #${escapeHtml(channel.name)}</p>
  <p>Ouvert par l'utilisateur ${escapeHtml(ticket.userId)} — Généré le ${new Date().toLocaleString("fr-FR")}</p>
  <p>${collected.length} message(s)</p>
</div>
${rows}
</body>
</html>`;

  return new AttachmentBuilder(Buffer.from(html, "utf-8"), {
    name: `transcript-ticket-${ticket.number}.html`,
  });
}

export type CloseTicketResult = { ok: true } | { ok: false; reason: string };

/**
 * Ferme un ticket : transcript HTML, mise à jour BDD, message de fermeture,
 * envoi du transcript dans le salon de logs, suppression différée du salon.
 */
export async function closeTicket(
  channel: TextChannel,
  closedBy: User,
  reason: string | null
): Promise<CloseTicketResult> {
  const ticket = await prisma.ticket.findUnique({ where: { channelId: channel.id } });
  if (!ticket || ticket.status !== "OPEN") {
    return { ok: false, reason: "Ce salon n'est pas un ticket ouvert." };
  }
  const settings = await getOrCreateTicketSettings(channel.guild.id);

  // Transcript AVANT toute modification du salon.
  const transcript = await generateTranscript(channel, ticket).catch(() => null);

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date(), closedBy: closedBy.id, closeReason: reason },
  });

  // Message de fermeture (variables appliquées sur l'auteur du ticket).
  const opener = await channel.client.users.fetch(ticket.userId).catch(() => null);
  const closeText = truncate(
    applyVariables(settings.closeMessage, { user: opener ?? closedBy, guild: channel.guild }),
    1000
  );
  const embed = baseEmbed(config.colors.warning)
    .setTitle(`${config.emojis.ticket} Ticket #${ticket.number} fermé`)
    .setDescription(
      [
        closeText,
        "",
        `**Fermé par :** <@${closedBy.id}>`,
        `**Raison :** ${reason ?? "Aucune raison précisée"}`,
        "Ce salon sera supprimé dans quelques secondes.",
      ].join("\n")
    );
  await channel.send({ embeds: [embed] }).catch(() => null);

  // Log de fermeture + transcript en pièce jointe.
  const logEmbed = baseEmbed(config.colors.warning)
    .setTitle(`${config.emojis.ticket} Ticket fermé`)
    .setDescription(
      [
        `**Ticket :** #${ticket.number} (\`${channel.name}\`)`,
        `**Ouvert par :** <@${ticket.userId}> (\`${ticket.userId}\`)`,
        `**Fermé par :** <@${closedBy.id}> (\`${closedBy.id}\`)`,
        `**Raison :** ${reason ?? "Aucune raison précisée"}`,
      ].join("\n")
    );
  await sendLog(channel.guild, "ticket", logEmbed, transcript ? [transcript] : []);

  // Suppression différée pour laisser lire le message de fermeture.
  setTimeout(() => {
    channel.delete(`Ticket #${ticket.number} fermé par ${closedBy.tag}`).catch(() => null);
  }, 5000);

  return { ok: true };
}
