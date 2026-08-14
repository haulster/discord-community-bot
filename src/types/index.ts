import type { ClientEvents, Message, PermissionResolvable } from "discord.js";
import type { BotClient } from "../structures/BotClient";

/** Niveaux de permission internes du bot (indépendants des permissions Discord). */
export type PermissionLevel =
  | "OWNER" // Owners du bot uniquement
  | "ADMIN" // Administration du serveur
  | "MODERATOR" // Modération (kick/ban…)
  | "TICKETS" // Gestion des tickets
  | "GIVEAWAY" // Gestion des giveaways
  | "SERVER" // Gestion serveur (émojis, renew…)
  | "USER"; // Tout le monde

export type CommandCategory =
  | "Utilitaire"
  | "Administration"
  | "Modération"
  | "Giveaway"
  | "Tickets"
  | "Configuration"
  | "Owner";

/** Structure d'une commande préfixée. */
export interface Command {
  name: string;
  aliases?: string[];
  category: CommandCategory;
  description: string;
  /** Exemple d'utilisation affiché dans +help et les erreurs d'arguments. */
  usage: string;
  /** Niveau de permission interne requis. */
  level: PermissionLevel;
  /** Permissions Discord dont le BOT a besoin pour exécuter la commande. */
  botPermissions?: PermissionResolvable[];
  /** Cooldown en secondes (anti-spam). */
  cooldown?: number;
  /** true = utilisable uniquement sur un serveur (défaut : true). */
  guildOnly?: boolean;
  /** true = masquée du +help. */
  hidden?: boolean;
  run: (client: BotClient, message: Message, args: string[]) => Promise<unknown>;
}

/** Structure d'un gestionnaire d'événement Discord. */
export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (client: BotClient, ...args: ClientEvents[K]) => Promise<unknown> | unknown;
}

/** Message supprimé mémorisé pour +snipe. */
export interface SnipedMessage {
  authorId: string;
  authorTag: string;
  authorAvatar: string;
  content: string;
  attachments: string[];
  createdAt: Date;
  deletedAt: Date;
}
