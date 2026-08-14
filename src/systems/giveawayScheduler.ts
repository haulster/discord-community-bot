import { prisma } from "../database/client";
import { endGiveaway } from "../services/giveawayService";
import type { BotClient } from "../structures/BotClient";

let interval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 15_000;

/**
 * Scheduler des giveaways : vérifie toutes les 15 s les giveaways ACTIFS
 * dont la date de fin est atteinte, et les termine. Comme tout est en base,
 * les giveaways survivent aux redémarrages : ceux expirés pendant que le bot
 * était éteint sont rattrapés dès le premier passage.
 */
export function startGiveawayScheduler(client: BotClient): void {
  if (interval) return;

  const tick = async (): Promise<void> => {
    try {
      const due = await prisma.giveaway.findMany({
        where: { status: "ACTIVE", endsAt: { lte: new Date() } },
        select: { messageId: true },
        take: 10,
      });
      for (const { messageId } of due) {
        const result = await endGiveaway(client, messageId);
        if (!result.ok) {
          console.warn(`[GIVEAWAY] Fin automatique impossible (${messageId}) : ${result.reason}`);
        }
      }
    } catch (error) {
      console.error("[GIVEAWAY] Erreur du scheduler :", error);
    }
  };

  void tick(); // rattrapage immédiat au démarrage
  interval = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  interval.unref();
  console.log("[GIVEAWAY] Scheduler démarré (vérification toutes les 15 s).");
}

/** Arrête le scheduler (arrêt propre). */
export function stopGiveawayScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
