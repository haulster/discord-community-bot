import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config/config";
import { prisma } from "./database/client";
import { BotClient } from "./structures/BotClient";
import type { BotEvent, Command } from "./types";

const client = new BotClient();

/** Liste récursivement les fichiers .ts/.js d'un dossier (tolère un dossier absent). */
function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (
      (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Charge toutes les commandes de src/commands (export default). */
function loadCommands(): void {
  const dir = path.join(__dirname, "commands");
  for (const file of walkFiles(dir)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(file) as { default?: Command };
      const command = mod.default;
      if (!command?.name || typeof command.run !== "function") {
        console.warn(`[LOADER] Fichier de commande invalide ignoré : ${file}`);
        continue;
      }
      const name = command.name.toLowerCase();
      if (client.commands.has(name)) {
        console.warn(`[LOADER] Commande dupliquée ignorée : ${name} (${file})`);
        continue;
      }
      client.commands.set(name, command);
      for (const alias of command.aliases ?? []) {
        client.aliases.set(alias.toLowerCase(), name);
      }
    } catch (error) {
      console.error(`[LOADER] Échec de chargement de la commande ${file} :`, error);
    }
  }
  console.log(`[LOADER] ${client.commands.size} commande(s) chargée(s).`);
}

/** Charge tous les événements de src/events (export default). */
function loadEvents(): void {
  const dir = path.join(__dirname, "events");
  let count = 0;
  for (const file of walkFiles(dir)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(file) as { default?: BotEvent };
      const event = mod.default;
      if (!event?.name || typeof event.execute !== "function") {
        console.warn(`[LOADER] Fichier d'événement invalide ignoré : ${file}`);
        continue;
      }
      // Chaque handler est isolé : une erreur ne fait jamais crasher le bot.
      const listener = (...args: unknown[]): void => {
        Promise.resolve(
          (event.execute as (c: BotClient, ...rest: unknown[]) => unknown)(client, ...args)
        ).catch((error) => {
          console.error(`[EVENT:${String(event.name)}] Erreur non gérée :`, error);
        });
      };
      if (event.once) client.once(event.name, listener);
      else client.on(event.name, listener);
      count++;
    } catch (error) {
      console.error(`[LOADER] Échec de chargement de l'événement ${file} :`, error);
    }
  }
  console.log(`[LOADER] ${count} événement(s) chargé(s).`);
}

// ------------------------------------------------------------------
// Gestion globale des erreurs : le process ne meurt jamais pour une
// commande — on logge tout côté console (voir aussi events/messageCreate).
// ------------------------------------------------------------------
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});

client.on("error", (error) => console.error("[CLIENT ERROR]", error));
client.on("warn", (warning) => console.warn("[CLIENT WARN]", warning));
client.rest.on("rateLimited", (info) => {
  console.warn(`[RATE LIMIT] route=${info.route} timeToReset=${info.timeToReset}ms`);
});

// Arrêt propre (Ctrl+C, pm2 stop/restart).
async function shutdown(signal: string): Promise<void> {
  console.log(`[SHUTDOWN] Signal ${signal} reçu, arrêt propre du bot...`);
  try {
    await prisma.$disconnect();
  } catch {
    // ignoré
  }
  await client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// ------------------------------------------------------------------
// Démarrage
// ------------------------------------------------------------------
async function main(): Promise<void> {
  loadCommands();
  loadEvents();

  await prisma.$connect();
  console.log("[DATABASE] Connexion Prisma établie.");

  await client.login(config.token);
}

main().catch((error) => {
  console.error("[FATAL] Impossible de démarrer le bot :", error);
  process.exit(1);
});
