import { ChannelType, type TextChannel } from "discord.js";
import { hasPermissionLevel } from "../../services/permissionService";
import { closeTicket, findTicketByChannel } from "../../services/ticketService";
import type { Command } from "../../types";
import { replyError, replyInfo } from "../../utils/embeds";

const command: Command = {
  name: "close",
  category: "Tickets",
  description: "Ferme le ticket courant avec transcript (auteur du ticket ou staff).",
  usage: "close [raison]",
  level: "USER",
  cooldown: 5,
  run: async (_client, message, args) => {
    if (!message.guild || !message.member || message.channel.type !== ChannelType.GuildText) {
      return;
    }

    const ticket = await findTicketByChannel(message.channelId);
    if (!ticket || ticket.status !== "OPEN") {
      await replyError(message, "Cette commande doit être utilisée dans un salon de ticket ouvert.");
      return;
    }

    // Niveau USER dans le dispatcher, mais contrôle fin ici via le
    // permissionService : seuls l'auteur du ticket OU le staff (niveau
    // Gestion tickets ou supérieur) peuvent fermer.
    const isOpener = message.author.id === ticket.userId;
    const isStaff = await hasPermissionLevel(message.member, "TICKETS");
    if (!isOpener && !isStaff) {
      await replyError(
        message,
        "Seul l'auteur du ticket ou le staff (niveau Gestion tickets) peut fermer ce ticket."
      );
      return;
    }

    const reason = args.join(" ").trim() || null;
    await replyInfo(message, "Fermeture du ticket : génération du transcript...");

    const result = await closeTicket(message.channel as TextChannel, message.author, reason);
    if (!result.ok) {
      await replyError(message, result.reason);
    }
  },
};

export default command;
