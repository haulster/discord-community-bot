import type { GuildMember, Message } from "discord.js";
import { extractUserId } from "../utils/resolvers";
import { isBotOwner } from "./ownerService";

/**
 * Sépare les cibles (mentions/IDs consécutifs en tête des arguments)
 * de la raison (le reste). Exemple : "+ban @A @B spam répété"
 * -> targets = ["@A", "@B"], reason = "spam répété".
 */
export function splitTargetsAndReason(args: string[]): { targets: string[]; reason: string } {
  const targets: string[] = [];
  let index = 0;
  while (index < args.length && extractUserId(args[index]) !== null) {
    targets.push(args[index]);
    index++;
  }
  const reason = args.slice(index).join(" ").trim() || "Aucune raison précisée";
  return { targets, reason };
}

/**
 * Contrôles communs AVANT toute sanction. Retourne la raison du refus,
 * ou null si la sanction est autorisée. Vérifie :
 * - auto-sanction, sanction du bot lui-même ;
 * - propriétaire du serveur et owners du bot (intouchables) ;
 * - hiérarchie des rôles de l'AUTEUR (sauf propriétaire du serveur) ;
 * - capacité réelle du BOT (hiérarchie + permission Discord effective).
 */
export async function checkSanctionTarget(
  message: Message,
  target: GuildMember,
  action: "kick" | "ban"
): Promise<string | null> {
  const guild = message.guild;
  const author = message.member;
  if (!guild || !author) return "contexte invalide.";

  if (target.id === message.author.id) return "tu ne peux pas te sanctionner toi-même.";
  if (target.id === message.client.user.id) return "je ne peux pas me sanctionner moi-même.";
  if (target.id === guild.ownerId) return "le propriétaire du serveur ne peut pas être sanctionné.";
  if (await isBotOwner(target.id)) return "un owner du bot ne peut pas être sanctionné.";

  // Hiérarchie de l'auteur : refuser si la cible a un rôle >= au sien
  // (le propriétaire du serveur passe outre cette règle).
  if (
    guild.ownerId !== author.id &&
    target.roles.highest.position >= author.roles.highest.position
  ) {
    return "son rôle est supérieur ou égal au tien.";
  }

  // Capacité réelle du bot (discord.js combine hiérarchie + permissions).
  if (action === "kick" && !target.kickable) {
    return "je ne peux pas l'expulser (hiérarchie des rôles).";
  }
  if (action === "ban" && !target.bannable) {
    return "je ne peux pas le bannir (hiérarchie des rôles).";
  }

  return null;
}
