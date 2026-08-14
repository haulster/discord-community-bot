/** Cooldowns en mémoire : clé "commande:userId" -> timestamp d'expiration. */
const store = new Map<string, number>();

/**
 * Vérifie et applique un cooldown.
 * Retourne 0 si la commande peut s'exécuter, sinon les secondes restantes.
 */
export function checkCooldown(commandName: string, userId: string, seconds: number): number {
  if (seconds <= 0) return 0;
  const key = `${commandName}:${userId}`;
  const now = Date.now();
  const expiresAt = store.get(key) ?? 0;

  if (expiresAt > now) {
    return Math.ceil((expiresAt - now) / 1000);
  }
  store.set(key, now + seconds * 1000);
  return 0;
}

// Nettoyage périodique des entrées expirées (n'empêche pas l'arrêt du process).
const cleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of store) {
    if (expiresAt <= now) store.delete(key);
  }
}, 10 * 60 * 1000);
cleaner.unref();
