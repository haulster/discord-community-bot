import { EmbedBuilder, type ColorResolvable, type Message } from "discord.js";
import { config } from "../config/config";

/** Embed de base avec couleur et timestamp. */
export function baseEmbed(color: ColorResolvable = config.colors.primary): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

export function successEmbed(description: string): EmbedBuilder {
  return baseEmbed(config.colors.success).setDescription(
    `${config.emojis.success} ${description}`
  );
}

export function errorEmbed(description: string): EmbedBuilder {
  return baseEmbed(config.colors.error).setDescription(`${config.emojis.error} ${description}`);
}

export function infoEmbed(description: string): EmbedBuilder {
  return baseEmbed(config.colors.info).setDescription(`${config.emojis.info} ${description}`);
}

export function warnEmbed(description: string): EmbedBuilder {
  return baseEmbed(config.colors.warning).setDescription(
    `${config.emojis.warning} ${description}`
  );
}

/** Répond avec un embed d'erreur sans jamais throw (DM fermés, message supprimé…). */
export async function replyError(message: Message, description: string): Promise<void> {
  await message
    .reply({ embeds: [errorEmbed(description)], allowedMentions: { repliedUser: false } })
    .catch(() => null);
}

export async function replySuccess(message: Message, description: string): Promise<void> {
  await message
    .reply({ embeds: [successEmbed(description)], allowedMentions: { repliedUser: false } })
    .catch(() => null);
}

export async function replyInfo(message: Message, description: string): Promise<void> {
  await message
    .reply({ embeds: [infoEmbed(description)], allowedMentions: { repliedUser: false } })
    .catch(() => null);
}

export async function replyWarn(message: Message, description: string): Promise<void> {
  await message
    .reply({ embeds: [warnEmbed(description)], allowedMentions: { repliedUser: false } })
    .catch(() => null);
}
