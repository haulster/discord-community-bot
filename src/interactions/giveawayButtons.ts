import type { ButtonInteraction } from "discord.js";
import { prisma } from "../database/client";
import { refreshGiveawayMessage, toggleEntry } from "../services/giveawayService";
import type { BotClient } from "../structures/BotClient";
import { errorEmbed, infoEmbed, successEmbed } from "../utils/embeds";
import { truncate } from "../utils/text";

/** Bouton "Participer" (customId "gw:join") — persistant, retrouvé via l'ID du message. */
export async function handleGiveawayButton(
  client: BotClient,
  interaction: ButtonInteraction
): Promise<void> {
  if (interaction.customId !== "gw:join") return;

  if (!interaction.inCachedGuild()) {
    await interaction
      .reply({ embeds: [errorEmbed("Action impossible en dehors d'un serveur.")], ephemeral: true })
      .catch(() => null);
    return;
  }

  const giveaway = await prisma.giveaway.findUnique({
    where: { messageId: interaction.message.id },
  });
  if (!giveaway) {
    await interaction
      .reply({ embeds: [errorEmbed("Ce giveaway n'existe plus.")], ephemeral: true })
      .catch(() => null);
    return;
  }

  const result = await toggleEntry(giveaway, interaction.member);
  if (result.status === "ERROR") {
    await interaction
      .reply({ embeds: [errorEmbed(result.reason)], ephemeral: true })
      .catch(() => null);
    return;
  }

  const prize = truncate(giveaway.prize, 200);
  const feedback =
    result.status === "JOINED"
      ? successEmbed(`Participation enregistrée pour **${prize}** ! Bonne chance 🍀`)
      : infoEmbed(`Participation retirée pour **${prize}**.`);
  await interaction.reply({ embeds: [feedback], ephemeral: true }).catch(() => null);

  // Met à jour le compteur de participants sur le message du giveaway.
  await refreshGiveawayMessage(client, giveaway, result.count);
}
