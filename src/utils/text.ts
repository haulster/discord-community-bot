import type { Guild, User } from "discord.js";

/** Motif approximatif de token Discord — masqué avant tout ré-affichage (+snipe). */
const TOKEN_REGEX = /[\w-]{20,30}\.[\w-]{5,10}\.[\w-]{20,40}/g;

/** Masque les chaînes ressemblant à des tokens/secrets dans un contenu. */
export function maskSensitive(content: string): string {
  return content.replace(TOKEN_REGEX, "[contenu sensible masqué]");
}

/** Tronque proprement une chaîne (embeds : limites Discord). */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1))}…`;
}

/** Échappe le HTML (transcripts de tickets). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface VariableContext {
  user: User;
  guild: Guild;
}

/**
 * Remplace les variables des messages configurables :
 * {user} {username} {server} {memberCount} {userId}
 */
export function applyVariables(template: string, ctx: VariableContext): string {
  return template
    .replace(/\{user\}/g, `<@${ctx.user.id}>`)
    .replace(/\{username\}/g, ctx.user.username)
    .replace(/\{server\}/g, ctx.guild.name)
    .replace(/\{memberCount\}/g, String(ctx.guild.memberCount))
    .replace(/\{userId\}/g, ctx.user.id);
}

/** Parse un JSON de tableau de chaînes en toute sécurité. */
export function parseStringArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
