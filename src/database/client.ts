import { PrismaClient } from "@prisma/client";

/** Instance Prisma unique pour tout le bot. */
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"],
});

/** Garantit qu'une guild existe en base (créée au premier besoin). */
export async function ensureGuild(guildId: string): Promise<void> {
  await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId },
  });
}
