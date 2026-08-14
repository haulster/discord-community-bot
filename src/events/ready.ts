import { config } from "../config/config";
import { startGiveawayScheduler } from "../systems/giveawayScheduler";
import { applyStaticPresence, startStatusRotation } from "../systems/statusRotator";
import type { BotEvent } from "../types";

const event: BotEvent<"ready"> = {
  name: "ready",
  once: true,
  execute: (client) => {
    console.log(
      `[READY] Connecté : ${client.user.tag} — ${client.guilds.cache.size} serveur(s).`
    );

    // Statut : rotatif si activé dans .env, sinon statique.
    if (config.presence.rotation) startStatusRotation(client);
    else applyStaticPresence(client);

    // Reprise des giveaways persistants (survit aux redémarrages).
    startGiveawayScheduler(client);
  },
};

export default event;
