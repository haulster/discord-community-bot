import {
  ChannelType,
  type Guild,
  type GuildMember,
  type Message,
  type Role,
  type TextChannel,
  type User,
} from "discord.js";

const SNOWFLAKE_REGEX = /^\d{15,21}$/;
const USER_MENTION_REGEX = /^<@!?(\d{15,21})>$/;
const CHANNEL_MENTION_REGEX = /^<#(\d{15,21})>$/;
const ROLE_MENTION_REGEX = /^<@&(\d{15,21})>$/;

/** Valide qu'une chaîne est un ID Discord plausible. */
export function isValidSnowflake(input: string): boolean {
  return SNOWFLAKE_REGEX.test(input);
}

/** Extrait un ID utilisateur depuis une mention ou un ID brut. */
export function extractUserId(input: string): string | null {
  const mention = input.match(USER_MENTION_REGEX);
  if (mention) return mention[1];
  return isValidSnowflake(input) ? input : null;
}

/** Extrait un ID de salon depuis une mention ou un ID brut. */
export function extractChannelId(input: string): string | null {
  const mention = input.match(CHANNEL_MENTION_REGEX);
  if (mention) return mention[1];
  return isValidSnowflake(input) ? input : null;
}

/** Extrait un ID de rôle depuis une mention ou un ID brut. */
export function extractRoleId(input: string): string | null {
  const mention = input.match(ROLE_MENTION_REGEX);
  if (mention) return mention[1];
  return isValidSnowflake(input) ? input : null;
}

/**
 * Résout un utilisateur global depuis : mention, ID, ou pseudo (si fiable).
 * Sans argument : auteur du message.
 */
export async function resolveUser(message: Message, input?: string): Promise<User | null> {
  if (!input) return message.author;

  const id = extractUserId(input);
  if (id) return message.client.users.fetch(id).catch(() => null);

  const member = await resolveMemberByName(message.guild, input);
  return member?.user ?? null;
}

/**
 * Résout un membre du serveur depuis : mention, ID, ou pseudo.
 * Sans argument : auteur du message.
 */
export async function resolveMember(
  message: Message,
  input?: string
): Promise<GuildMember | null> {
  if (!message.guild) return null;
  if (!input) return message.member;

  const id = extractUserId(input);
  if (id) return message.guild.members.fetch(id).catch(() => null);

  return resolveMemberByName(message.guild, input);
}

/** Recherche par pseudo exact (username ou pseudo serveur), sinon requête API. */
async function resolveMemberByName(
  guild: Guild | null,
  input: string
): Promise<GuildMember | null> {
  if (!guild) return null;
  const lower = input.toLowerCase();

  const cached = guild.members.cache.find(
    (m) => m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower
  );
  if (cached) return cached;

  const fetched = await guild.members.fetch({ query: input, limit: 1 }).catch(() => null);
  return fetched?.first() ?? null;
}

/** Résout un salon textuel du serveur (mention, ID). Sans argument : salon courant. */
export async function resolveTextChannel(
  message: Message,
  input?: string
): Promise<TextChannel | null> {
  if (!message.guild) return null;
  if (!input) {
    return message.channel.type === ChannelType.GuildText
      ? (message.channel as TextChannel)
      : null;
  }
  const id = extractChannelId(input);
  if (!id) return null;
  const channel =
    message.guild.channels.cache.get(id) ??
    (await message.guild.channels.fetch(id).catch(() => null));
  return channel && channel.type === ChannelType.GuildText ? (channel as TextChannel) : null;
}

/** Résout un rôle du serveur (mention, ID, nom exact). */
export async function resolveRole(guild: Guild, input: string): Promise<Role | null> {
  const id = extractRoleId(input);
  if (id) {
    return guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null));
  }
  const lower = input.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ?? null;
}

/** Valide une URL http(s) — protection contre les schémas dangereux. */
export function isValidHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
