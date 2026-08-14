import { ChannelType, PermissionFlagsBits, type TextChannel } from "discord.js";
import { config } from "../../config/config";
import { prisma } from "../../database/client";
import { findTicketByChannel } from "../../services/ticketService";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";
import { resolveMember } from "../../utils/resolvers";

const command: Command = {
  name: "del",
  aliases: ["remove"],
  category: "Tickets",
  description: "Retire un membre du ticket courant.",
  usage: "del <membre>",
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
      await replyError(message, `Syntaxe : \`${config.prefix}del <membre>\``);
      return;
    }
    const member = await resolveMember(message, args[0]);
    if (!member) {
      await replyError(message, "Membre introuvable (mention, ID ou pseudo exact).");
      return;
    }
    if (member.id === ticket.userId) {
      await replyError(
        message,
        `Impossible de retirer l'auteur du ticket. Utilise \`${config.prefix}close\` pour fermer le ticket.`
      );
      return;
    }

    const channel = message.channel as TextChannel;
    await channel.permissionOverwrites.delete(member.id).catch(() => null);
    await prisma.ticketMember.deleteMany({
      where: { ticketId: ticket.id, userId: member.id },
    });

    await replySuccess(message, `<@${member.id}> a été retiré du ticket.`);
  },
};

export default command;
