import { handleGiveawayButton } from "../interactions/giveawayButtons";
import { handleTicketInteraction } from "../interactions/ticketButtons";
import type { BotEvent } from "../types";
import { errorEmbed } from "../utils/embeds";

const event: BotEvent<"interactionCreate"> = {
  name: "interactionCreate",
  execute: async (client, interaction) => {
    try {
      if (interaction.isButton()) {
        // Boutons persistants (fonctionnent même après un redémarrage du bot).
        if (interaction.customId.startsWith("gw:")) {
          await handleGiveawayButton(client, interaction);
          return;
        }
        if (interaction.customId.startsWith("ticket:")) {
          await handleTicketInteraction(client, interaction);
          return;
        }
      }
      // Les panneaux de configuration (+giveaway, +ticket settings, +join settings,
      // +soutien, +logs, +setperm) utilisent des collectors attachés à leurs propres
      // messages : leurs interactions sont traitées là-bas, rien à faire ici.
    } catch (error) {
      console.error("[INTERACTION] Erreur non gérée :", error);
      if (interaction.isRepliable()) {
        const embeds = [
          errorEmbed("Une erreur est survenue pendant le traitement de cette interaction."),
        ];
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ embeds, ephemeral: true }).catch(() => null);
        } else {
          await interaction.reply({ embeds, ephemeral: true }).catch(() => null);
        }
      }
    }
  },
};

export default event;
