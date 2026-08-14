import type { BotOwner } from "@prisma/client";
import { config } from "../config/config";
import { prisma } from "../database/client";

/** Le Root Owner est défini dans .env (ROOT_OWNER_ID) et ne peut jamais être retiré. */
export function isRootOwner(userId: string): boolean {
  return userId === config.rootOwnerId;
}

/** Un utilisateur est-il owner du bot (Root Owner inclus) ? */
export async function isBotOwner(userId: string): Promise<boolean> {
  if (isRootOwner(userId)) return true;
  const row = await prisma.botOwner.findUnique({ where: { userId } });
  return row !== null;
}

/** Ajoute un owner (idempotent). Retourne false s'il l'était déjà. */
export async function addBotOwner(userId: string, addedBy: string): Promise<boolean> {
  if (isRootOwner(userId)) return false; // déjà owner par définition
  const existing = await prisma.botOwner.findUnique({ where: { userId } });
  if (existing) return false;
  await prisma.botOwner.create({ data: { userId, addedBy } });
  return true;
}

/**
 * Retire un owner. Retourne :
 * - "ROOT"      : refus, c'est le Root Owner
 * - "NOT_OWNER" : l'utilisateur n'était pas owner
 * - "REMOVED"   : retiré avec succès
 */
export async function removeBotOwner(userId: string): Promise<"ROOT" | "NOT_OWNER" | "REMOVED"> {
  if (isRootOwner(userId)) return "ROOT";
  const result = await prisma.botOwner.deleteMany({ where: { userId } });
  return result.count > 0 ? "REMOVED" : "NOT_OWNER";
}

/** Liste des owners enregistrés en base (hors Root Owner, ajouté à l'affichage). */
export async function listBotOwners(): Promise<BotOwner[]> {
  return prisma.botOwner.findMany({ orderBy: { addedAt: "asc" } });
}
