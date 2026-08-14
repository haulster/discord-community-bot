import "dotenv/config";
import { ActivityType, type ColorResolvable, type PresenceStatusData } from "discord.js";

/** Lit une variable d'environnement obligatoire, sinon arrête le bot proprement. */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`[CONFIG] Variable d'environnement manquante ou vide : ${name}`);
    console.error(`[CONFIG] Copie .env.example vers .env puis remplis les valeurs.`);
    process.exit(1);
  }
  return value.trim();
}

/** Lit une variable optionnelle avec valeur par défaut. */
function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

const ACTIVITY_TYPES: Record<string, Exclude<ActivityType, ActivityType.Custom>> = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
};

const VALID_STATUSES = new Set(["online", "idle", "dnd", "invisible"]);
const rawStatus = optional("BOT_STATUS", "online").toLowerCase();

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: optional("CLIENT_ID", ""),
  rootOwnerId: required("ROOT_OWNER_ID"),

  /** Préfixe des commandes — modifiable via BOT_PREFIX dans .env */
  prefix: optional("BOT_PREFIX", "+"),

  presence: {
    status: (VALID_STATUSES.has(rawStatus) ? rawStatus : "online") as PresenceStatusData,
    activity: optional("BOT_ACTIVITY", "+help"),
    activityType:
      ACTIVITY_TYPES[optional("BOT_ACTIVITY_TYPE", "Watching").toLowerCase()] ??
      ActivityType.Watching,
    rotation: optional("BOT_STATUS_ROTATION", "false").toLowerCase() === "true",
    rotationIntervalSeconds: Math.max(
      10,
      Number.parseInt(optional("BOT_STATUS_ROTATION_INTERVAL", "30"), 10) || 30
    ),
  },

  colors: {
    primary: optional("EMBED_COLOR", "#5865F2") as ColorResolvable,
    success: "#57F287" as ColorResolvable,
    error: "#ED4245" as ColorResolvable,
    warning: "#FEE75C" as ColorResolvable,
    info: "#5865F2" as ColorResolvable,
    giveaway: "#EB459E" as ColorResolvable,
  },

  emojis: {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    giveaway: "🎉",
    ticket: "🎫",
    member: "👤",
    crown: "👑",
  },

  limits: {
    /** Nombre de messages supprimés mémorisés par salon */
    snipePerChannel: 10,
    /** Durée de vie du cache snipe (ms) */
    snipeTtlMs: 10 * 60 * 1000,
    /** Nombre max de messages inclus dans un transcript de ticket */
    transcriptMaxMessages: 500,
    /** Durée max d'un giveaway (ms) — 60 jours */
    giveawayMaxDurationMs: 60 * 24 * 60 * 60 * 1000,
  },
} as const;

export type BotConfig = typeof config;
