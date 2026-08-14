import { ChannelType, PermissionFlagsBits, type TextChannel } from "discord.js";
import { config } from "../../config/config";
import { findTicketByChannel, sanitizeChannelName } from "../../services/ticketService";
import type { Command } from "../../types";
import { replyError, replySuccess } from "../../utils/embeds";

const command: Command = {
  name: "rename",
  category: "Tickets",
  description: "Renomme le salon du ticket courant.",
  usage: "rename <nom>",
  level: "TICKETS",
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 5,
  run: async (_client, message, args) => {
    if (!message.guild || message.channel.type !== ChannelType.GuildText) return;

    const ticket = await findTicketByChannel(message.channelId);
    if (!ticket || ticket.status !== "OPEN") {
      await replyError(message, "Cette commande doit être utilisée dans un salon de ticket ouvert.");
      return;
    }

    const raw = args.join(" ").trim();
    if (!raw) {
      await replyError(message, `Syntaxe : \`${config.prefix}rename <nom>\``);
      return;
    }

    const name = sanitizeChannelName(raw);
    const channel = message.channel as TextChannel;
    await channel.setName(name, `Ticket renommé par ${message.author.tag}`);
    await replySuccess(message, `Ticket renommé en \`${name}\`.`);
  },
};

export default command;
