import { config } from "../config/config";
import { rotatingStatuses } from "../config/status";
import type { BotClient } from "../structures/BotClient";

let interval: NodeJS.Timeout | null = null;

/** Remplace {servers}, {members} et {prefix} dans un texte de statut. */
function formatStatusText(client: BotClient, text: string): string {
  const members = client.guilds.cache.reduce((total, guild) => total + (guild.memberCount ?? 0), 0);
  return text
    .replace(/\{servers\}/g, String(client.guilds.cache.size))
    .replace(/\{members\}/g, String(members))
    .replace(/\{prefix\}/g, config.prefix);
}

/** Applique le statut statique défini dans .env (BOT_STATUS / BOT_ACTIVITY / BOT_ACTIVITY_TYPE). */
export function applyStaticPresence(client: BotClient): void {
  client.user.setPresence({
    status: config.presence.status,
    activities: [
      {
        name: formatStatusText(client, config.presence.activity),
        type: config.presence.activityType,
      },
    ],
  });
  console.log(`[PRESENCE] Statut statique appliqué : ${config.presence.activity}`);
}

/** Démarre la rotation des statuts définis dans src/config/status.ts. */
export function startStatusRotation(client: BotClient): void {
  stopStatusRotation();
  if (rotatingStatuses.length === 0) {
    applyStaticPresence(client);
    return;
  }

  let index = 0;
  const apply = (): void => {
    const status = rotatingStatuses[index % rotatingStatuses.length];
    index++;
    client.user.setPresence({
      status: config.presence.status,
      activities: [{ name: formatStatusText(client, status.text), type: status.type }],
    });
  };

  apply();
  interval = setInterval(apply, config.presence.rotationIntervalSeconds * 1000);
  interval.unref();
  console.log(
    `[PRESENCE] Rotation démarrée (${rotatingStatuses.length} statuts, toutes les ${config.presence.rotationIntervalSeconds}s).`
  );
}

/** Arrête la rotation (utilisé avant un redémarrage de rotation). */
export function stopStatusRotation(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
