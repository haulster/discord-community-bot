import { PermissionFlagsBits, type TextChannel } from "discord.js";
import { findTicketByChannel } from "../../services/ticketService";
import type { Command } from "../../types";
import { replyError, successEmbed } from "../../utils/embeds";
import { resolveTextChannel } from "../../utils/resolvers";

const command: Command = {
  name: "renew",
  aliases: ["nuke"],
  category: "Administration",
  description: "Recrée un salon à l'identique (historique remis à zéro).",
  usage: "renew [salon]",
  level: "SERVER",
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 10,
  run: async (_client, message, args) => {
    if (!message.guild) return;

    const target = await resolveTextChannel(message, args[0]);
    if (!target) {
      await replyError(message, "Salon introuvable ou invalide (salon textuel requis).");
      return;
    }

    // Sécurité : ne jamais renew un ticket ouvert (transcript et BDD passeraient
    // à la trappe) — la fermeture propre passe par +close.
    const ticket = await findTicketByChannel(target.id);
    if (ticket && ticket.status === "OPEN") {
      await replyError(message, "Ce salon est un ticket ouvert : utilise `+close` à la place.");
      return;
    }

    const position = target.position;
    const reason = `Renew par ${message.author.tag}`;

    // clone() conserve nom, sujet, permissions, NSFW et mode lent.
    let clone: TextChannel | null = null;
    try {
      clone = await target.clone({ reason });
    } catch {
      clone = null;
    }
    if (!clone) {
      await replyError(message, "Impossible de cloner le salon (permissions insuffisantes ?).");
      return;
    }
    await clone.setPosition(position).catch(() => null);

    const deleted = await target
      .delete(reason)
      .then(() => true)
      .catch(() => false);
    if (!deleted) {
      // On annule proprement pour ne pas laisser un doublon.
      await clone.delete("Renew annulé : suppression de l'original impossible").catch(() => null);
      await replyError(message, "Impossible de supprimer l'ancien salon : renew annulé.");
      return;
    }

    await clone
      .send({
        embeds: [successEmbed(`Salon recréé par ${message.author}. Historique remis à zéro.`)],
      })
      .catch(() => null);
  },
};

export default command;
