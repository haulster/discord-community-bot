import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ButtonInteraction,
} from "discord.js";
import { hasPermissionLevel } from "../services/permissionService";
import { closeTicket, createTicket, findTicketByChannel } from "../services/ticketService";
import type { BotClient } from "../structures/BotClient";
import { errorEmbed, infoEmbed, successEmbed, warnEmbed } from "../utils/embeds";

/** Routeur des boutons "ticket:" (persistants : survivent aux redémarrages). */
export async function handleTicketInteraction(
  _client: BotClient,
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction
      .reply({ embeds: [errorEmbed("Action impossible en dehors d'un serveur.")], ephemeral: true })
      .catch(() => null);
    return;
  }

  switch (interaction.customId) {
    case "ticket:create":
      await handleCreate(interaction);
      return;
    case "ticket:close":
      await handleCloseRequest(interaction);
      return;
    case "ticket:close-confirm":
      await handleCloseConfirm(interaction);
      return;
    case "ticket:close-cancel":
      await interaction
        .update({ embeds: [infoEmbed("Fermeture annulée.")], components: [] })
        .catch(() => null);
      return;
    default:
      return;
  }
}

/** Bouton du panneau : ouverture d'un ticket. */
async function handleCreate(interaction: ButtonInteraction<"cached">): Promise<void> {
  await interaction.deferReply({ ephemeral: true }).catch(() => null);
  const result = await createTicket(interaction.guild, interaction.user);
  if (!result.ok) {
    await interaction.editReply({ embeds: [errorEmbed(result.reason)] }).catch(() => null);
    return;
  }
  await interaction
    .editReply({ embeds: [successEmbed(`Ton ticket est ouvert : <#${result.channel.id}>`)] })
    .catch(() => null);
}

/** Bouton dans le ticket : demande de fermeture (avec confirmation). */
async function handleCloseRequest(interaction: ButtonInteraction<"cached">): Promise<void> {
  const ticket = await findTicketByChannel(interaction.channelId);
  if (!ticket || ticket.status !== "OPEN") {
    await interaction
      .reply({ embeds: [errorEmbed("Ce salon n'est pas un ticket ouvert.")], ephemeral: true })
      .catch(() => null);
    return;
  }

  const isOpener = interaction.user.id === ticket.userId;
  const isStaff = await hasPermissionLevel(interaction.member, "TICKETS");
  if (!isOpener && !isStaff) {
    await interaction
      .reply({
        embeds: [errorEmbed("Seul l'auteur du ticket ou le staff peut fermer ce ticket.")],
        ephemeral: true,
      })
      .catch(() => null);
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket:close-confirm")
      .setLabel("Confirmer la fermeture")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket:close-cancel")
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Secondary)
  );
  await interaction
    .reply({
      embeds: [
        warnEmbed(
          "Confirmer la fermeture de ce ticket ? Un transcript sera généré puis le salon sera supprimé."
        ),
      ],
      components: [row],
      ephemeral: true,
    })
    .catch(() => null);
}

/** Confirmation de fermeture : transcript, log, suppression du salon. */
async function handleCloseConfirm(interaction: ButtonInteraction<"cached">): Promise<void> {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction
      .reply({ embeds: [errorEmbed("Salon invalide.")], ephemeral: true })
      .catch(() => null);
    return;
  }

  const ticket = await findTicketByChannel(channel.id);
  if (!ticket || ticket.status !== "OPEN") {
    await interaction
      .update({ embeds: [errorEmbed("Ce ticket est déjà fermé.")], components: [] })
      .catch(() => null);
    return;
  }

  const isOpener = interaction.user.id === ticket.userId;
  const isStaff = await hasPermissionLevel(interaction.member, "TICKETS");
  if (!isOpener && !isStaff) {
    await interaction
      .update({ embeds: [errorEmbed("Permission refusée.")], components: [] })
      .catch(() => null);
    return;
  }

  await interaction
    .update({
      embeds: [infoEmbed("Fermeture en cours... génération du transcript.")],
      components: [],
    })
    .catch(() => null);

  const result = await closeTicket(channel, interaction.user, "Fermé via le bouton");
  if (!result.ok) {
    await interaction
      .followUp({ embeds: [errorEmbed(result.reason)], ephemeral: true })
      .catch(() => null);
  }
}
