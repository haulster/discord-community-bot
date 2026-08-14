const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  j: 86_400_000, // "j" pour jours (français)
  w: 604_800_000,
};

/**
 * Parse une durée du type "10m", "1h30m", "2d", "45" (minutes par défaut).
 * Retourne la durée en millisecondes, ou null si invalide.
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Nombre seul => minutes
  if (/^\d+$/.test(trimmed)) {
    const minutes = Number.parseInt(trimmed, 10);
    return minutes > 0 ? minutes * UNIT_MS.m : null;
  }

  const regex = /(\d+)\s*(s|m|h|d|j|w)/g;
  let total = 0;
  let matchedLength = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    total += Number.parseInt(match[1], 10) * UNIT_MS[match[2]];
    matchedLength += match[0].length;
  }

  // Refuse les entrées partiellement invalides ("1h abc")
  const compact = trimmed.replace(/\s+/g, "");
  const compactMatched = compact.replace(/(\d+)(s|m|h|d|j|w)/g, "");
  if (compactMatched.length > 0) return null;

  return total > 0 && matchedLength > 0 ? total : null;
}

/** Formate une durée en texte court : "1j 2h 5m". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !days) parts.push(`${seconds}s`);
  return parts.length > 0 ? parts.join(" ") : "0s";
}

/** Timestamp Discord : R = relatif, F = date complète, f, t, T, d, D. */
export function discordTimestamp(date: Date, style: "R" | "F" | "f" | "t" | "T" | "d" | "D" = "R"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
