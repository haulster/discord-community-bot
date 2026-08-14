import { ActivityType } from "discord.js";
import { prisma } from "../database/client";
import type { BotEvent } from "../types";

/**
 * Système soutien : quand le texte configuré apparaît dans le statut personnalisé
 * d'un membre, le rôle configuré lui est ajouté ; quand il le retire, le rôle
 * est retiré. Nécessite l'intent GuildPresences (Presence Intent dans le portal).
 *
 * Limitation Discord : seul le "custom status" (ActivityType.Custom, champ state)
 * est lisible via la gateway. Les membres hors-ligne/invisibles n'émettent pas
 * de présence : leur rôle est mis à jour dès leur prochain changement de statut.
 */
const event: BotEvent<"presenceUpdate"> = {
  name: "presenceUpdate",
  execute: async (_client, _oldPresence, newPresence) => {
    const guild = newPresence.guild;
    if (!guild || !newPresence.userId) return;

    const settings = await prisma.soutienSettings.findUnique({ where: { guildId: guild.id } });
    if (!settings?.enabled || !settings.text || !settings.roleId) return;

    const role = guild.roles.cache.get(settings.roleId);
    if (!role) return;

    // Le bot doit pouvoir gérer ce rôle (hiérarchie + rôle non géré par une intégration).
    const me = guild.members.me;
    if (!me || role.managed || role.position >= me.roles.highest.position) return;

    const member =
      newPresence.member ?? (await guild.members.fetch(newPresence.userId).catch(() => null));
    if (!member || member.user.bot) return;

    const searched = settings.text.toLowerCase();
    const hasText = newPresence.activities.some(
      (activity) =>
        activity.type === ActivityType.Custom &&
        (activity.state ?? "").toLowerCase().includes(searched)
    );
    const hasRole = member.roles.cache.has(role.id);

    if (hasText && !hasRole) {
      await member.roles.add(role, "Soutien : texte présent dans le statut").catch(() => null);
    } else if (!hasText && hasRole) {
      await member.roles.remove(role, "Soutien : texte retiré du statut").catch(() => null);
    }
  },
};

export default event;
