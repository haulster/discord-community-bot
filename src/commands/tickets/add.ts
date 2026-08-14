import { ChannelType, PermissionFlagsBits, type TextChannel } from "discord.js";
import { config } from "../../config/config";
import { prisma } from "../../database/client";
import { findTicketByChannel } from "../../services/ticketService";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";
import { resolveMember } from "../../utils/resolvers";

const command: Command = {
  name: "add",
  category: "Tickets",
  description: "Ajoute un membre au ticket courant.",
  usage: "add <membre>",
  level: "TICKETS",
  botPermissions: [PermissionFlagsBits.ManageRoles],
  cooldown: 3,
  run: async (_client, message, args) => {
    if (!message.guild || message.channel.type !== ChannelType.GuildText) return;

    const ticket = await findTicketByChannel(message.channelId);
    if (!ticket || ticket.status !== "OPEN") {
      await replyError(message, "Cette commande doit être utilisée dans un salon de ticket ouvert.");
      return;
    }

    if (!args[0]) {
      await replyError(message, `Syntaxe : \`${config.prefix}add <membre>\``);
      return;
    }
    const member = await resolveMember(message, args[0]);
    if (!member) {
      await replyError(message, "Membre introuvable (mention, ID ou pseudo exact).");
      return;
    }
    if (member.user.bot) {
      await replyError(message, "Impossible d'ajouter un bot à un ticket.");
      return;
    }

    const channel = message.channel as TextChannel;
    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    });

    await prisma.ticketMember.upsert({
      where: { ticketId_userId: { ticketId: ticket.id, userId: member.id } },
      update: {},
      create: { ticketId: ticket.id, userId: member.id },
    });

    await replySuccess(message, `<@${member.id}> a été ajouté au ticket.`);
  },
};

export default command;
