import type { Message, PartialMessage } from "discord.js";
import { config } from "../config/config";
import type { SnipedMessage } from "../types";
import { maskSensitive } from "../utils/text";

/** Cache en mémoire : channelId -> messages supprimés (du plus récent au plus ancien). */
const store = new Map<string, SnipedMessage[]>();

/** Enregistre un message supprimé (appelé par l'événement messageDelete). */
export function recordDeletedMessage(message: Message | PartialMessage): void {
  // Message partiel (non présent en cache) : contenu inconnu, rien à mémoriser.
  if (message.partial) return;
  if (!message.guild || !message.author || message.author.bot) return;

  const content = message.content ?? "";
  const attachments = [...message.attachments.values()].map((a) => a.url).slice(0, 5);
  if (!content && attachments.length === 0) return;

  const entry: SnipedMessage = {
    authorId: message.author.id,
    authorTag: message.author.tag,
    authorAvatar: message.author.displayAvatarURL({ size: 256 }),
    content: maskSensitive(content),
    attachments,
    createdAt: message.createdAt,
    deletedAt: new Date(),
  };

  const list = store.get(message.channelId) ?? [];
  list.unshift(entry);
  store.set(message.channelId, list.slice(0, config.limits.snipePerChannel));
}

/** Récupère le dernier message supprimé NON expiré du salon (snipe propre au salon). */
export function getLastSnipe(channelId: string): SnipedMessage | null {
  const list = store.get(channelId);
  if (!list || list.length === 0) return null;

  const cutoff = Date.now() - config.limits.snipeTtlMs;
  const valid = list.filter((snipe) => snipe.deletedAt.getTime() >= cutoff);

  if (valid.length === 0) {
    store.delete(channelId);
    return null;
  }
  store.set(channelId, valid);
  return valid[0];
}

// Purge périodique globale du cache expiré.
const cleaner = setInterval(() => {
  const cutoff = Date.now() - config.limits.snipeTtlMs;
  for (const [channelId, list] of store) {
    const valid = list.filter((snipe) => snipe.deletedAt.getTime() >= cutoff);
    if (valid.length === 0) store.delete(channelId);
    else store.set(channelId, valid);
  }
}, 5 * 60 * 1000);
cleaner.unref();
