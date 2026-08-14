import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { truncate } from "./text";

/**
 * Ouvre un modal à un champ et attend la soumission (2 minutes).
 * Retourne la valeur saisie + l'interaction de soumission (pour les followUp
 * d'erreur de validation), ou null si expiré/annulé.
 */
export async function promptModal(
  interaction: MessageComponentInteraction,
  idPrefix: string,
  field: string,
  label: string,
  current: string,
  maxLength: number,
  long: boolean,
  required = true
): Promise<{ value: string; submitted: ModalSubmitInteraction } | null> {
  const modalId = `${idPrefix}:modal:${field}:${interaction.id}`;
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(truncate(label, 45))
    .setStyle(long ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setMaxLength(maxLength)
    .setRequired(required);
  if (current) input.setValue(truncate(current, maxLength));

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle("Configuration")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));

  await interaction.showModal(modal);
  const submitted = await interaction
    .awaitModalSubmit({
      time: 120_000,
      filter: (m) => m.customId === modalId && m.user.id === interaction.user.id,
    })
    .catch(() => null);
  if (!submitted) return null;

  const value = submitted.fields.getTextInputValue("value").trim();
  await submitted.deferUpdate().catch(() => null);
  return { value, submitted };
}
