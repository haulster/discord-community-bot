import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { prisma } from "../database/client";
import type { PermissionLevel } from "../types";
import { isBotOwner } from "./ownerService";

/** Libellés d'affichage des niveaux internes. */
export const LEVEL_LABELS: Record<PermissionLevel, string> = {
  OWNER: "Owner du bot",
  ADMIN: "Admin",
  MODERATOR: "Modérateur",
  TICKETS: "Gestion tickets",
  GIVEAWAY: "Gestion giveaway",
  SERVER: "Gestion serveur",
  USER: "Utilisateur",
};

/** Niveaux assignables via +setperm (OWNER et USER exclus, gérés autrement). */
export const ASSIGNABLE_LEVELS: PermissionLevel[] = [
  "ADMIN",
  "MODERATOR",
  "TICKETS",
  "GIVEAWAY",
  "SERVER",
];

/** Repli sur les permissions Discord natives quand aucune permission interne n'existe. */
const DISCORD_FALLBACK: Record<PermissionLevel, (member: GuildMember) => boolean> = {
  OWNER: () => false,
  ADMIN: (m) => m.permissions.has(PermissionFlagsBits.Administrator),
  MODERATOR: (m) =>
    m.permissions.has(PermissionFlagsBits.KickMembers) ||
    m.permissions.has(PermissionFlagsBits.BanMembers) ||
    m.permissions.has(PermissionFlagsBits.ModerateMembers),
  TICKETS: (m) => m.permissions.has(PermissionFlagsBits.ManageChannels),
  GIVEAWAY: (m) => m.permissions.has(PermissionFlagsBits.ManageGuild),
  SERVER: (m) => m.permissions.has(PermissionFlagsBits.ManageGuild),
  USER: () => true,
};

/**
 * Vérifie si un membre possède un niveau interne.
 * Hiérarchie : Owner du bot > propriétaire du serveur / Administrateur Discord >
 * niveau interne ADMIN > niveau interne exact > repli permissions Discord.
 */
export async function hasPermissionLevel(
  member: GuildMember,
  level: PermissionLevel
): Promise<boolean> {
  if (level === "USER") return true;

  // Les owners du bot ont TOUJOURS toutes les permissions internes.
  if (await isBotOwner(member.id)) return true;
  if (level === "OWNER") return false;

  // Propriétaire du serveur et Administrateur Discord : accès total (hors OWNER).
  if (member.guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Permissions internes (utilisateur direct ou via ses rôles).
  const targetIds = [member.id, ...member.roles.cache.map((role) => role.id)];
  const rows = await prisma.internalPermission.findMany({
    where: { guildId: member.guild.id, targetId: { in: targetIds } },
    select: { level: true },
  });
  const owned = new Set(rows.map((r) => r.level));
  if (owned.has("ADMIN")) return true;
  if (owned.has(level)) return true;

  return DISCORD_FALLBACK[level](member);
}

/** Ajoute une permission interne à un utilisateur ou un rôle. */
export async function grantPermission(
  guildId: string,
  targetId: string,
  targetType: "USER" | "ROLE",
  level: PermissionLevel
): Promise<void> {
  await prisma.internalPermission.upsert({
    where: { guildId_targetId_level: { guildId, targetId, level } },
    update: { targetType },
    create: { guildId, targetId, targetType, level },
  });
}

/** Retire une permission interne. Retourne true si quelque chose a été supprimé. */
export async function revokePermission(
  guildId: string,
  targetId: string,
  level: PermissionLevel
): Promise<boolean> {
  const result = await prisma.internalPermission.deleteMany({
    where: { guildId, targetId, level },
  });
  return result.count > 0;
}

/** Liste toutes les permissions internes d'un serveur. */
export async function listPermissions(guildId: string) {
  return prisma.internalPermission.findMany({
    where: { guildId },
    orderBy: [{ level: "asc" }, { targetType: "asc" }],
  });
}
