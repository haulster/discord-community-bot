import { config } from "../../config/config";
import { sendLog } from "../../services/logService";
import {
  ASSIGNABLE_LEVELS,
  grantPermission,
  LEVEL_LABELS,
  revokePermission,
} from "../../services/permissionService";
import type { Command, PermissionLevel } from "../../types";
import { baseEmbed, replyError, replySuccess } from "../../utils/embeds";
import { resolveMember, resolveRole } from "../../utils/resolvers";

const USER_MENTION = /^<@!?\d{15,21}>$/;
const ROLE_MENTION = /^<@&\d{15,21}>$/;

const command: Command = {
  name: "setperm",
  category: "Configuration",
  description: "Accorde ou retire un niveau de permission interne à un membre ou un rôle.",
  usage: "setperm <add/remove> <niveau> <@membre/@rôle>",
  level: "ADMIN",
  cooldown: 3,
  run: async (_client, message, args) => {
    if (!message.guild) return;
    const guild = message.guild;

    const levelsHelp = ASSIGNABLE_LEVELS.map((l) => `\`${l}\` (${LEVEL_LABELS[l]})`).join(", ");
    const action = (args[0] ?? "").toLowerCase();
    const levelInput = (args[1] ?? "").toUpperCase();
    const targetInput = args[2];

    if ((action !== "add" && action !== "remove") || !levelInput || !targetInput) {
      await replyError(
        message,
        `Syntaxe : \`${config.prefix}setperm <add/remove> <niveau> <@membre/@rôle>\`\nNiveaux : ${levelsHelp}`
      );
      return;
    }
    if (!ASSIGNABLE_LEVELS.includes(levelInput as PermissionLevel)) {
      await replyError(
        message,
        `Niveau invalide.\nNiveaux disponibles : ${levelsHelp}\n(Le niveau OWNER se gère uniquement via \`${config.prefix}owner\`.)`
      );
      return;
    }
    const level = levelInput as PermissionLevel;

    // ---- Résolution de la cible : membre OU rôle ----
    let targetId: string | null = null;
    let targetType: "USER" | "ROLE" | null = null;
    let display = "";

    if (ROLE_MENTION.test(targetInput)) {
      const role = await resolveRole(guild, targetInput);
      if (role) {
        targetId = role.id;
        targetType = "ROLE";
        display = `le rôle <@&${role.id}>`;
      }
    } else if (USER_MENTION.test(targetInput)) {
      const member = await resolveMember(message, targetInput);
      if (member) {
        if (member.user.bot) {
          await replyError(message, "Impossible d'assigner une permission interne à un bot.");
          return;
        }
        targetId = member.id;
        targetType = "USER";
        display = `<@${member.id}>`;
      }
    } else {
      // ID brut ou nom : on essaie d'abord un membre, puis un rôle.
      const member = await resolveMember(message, targetInput);
      if (member) {
        if (member.user.bot) {
          await replyError(message, "Impossible d'assigner une permission interne à un bot.");
          return;
        }
        targetId = member.id;
        targetType = "USER";
        display = `<@${member.id}>`;
      } else {
        const role = await resolveRole(guild, targetInput);
        if (role) {
          targetId = role.id;
          targetType = "ROLE";
          display = `le rôle <@&${role.id}>`;
        }
      }
    }

    if (!targetId || !targetType) {
      await replyError(
        message,
        "Cible introuvable : mentionne un **membre** ou un **rôle** (ou donne son ID)."
      );
      return;
    }
    if (targetType === "ROLE" && targetId === guild.id) {
      await replyError(message, "Impossible d'assigner une permission interne à **@everyone**.");
      return;
    }

    // ---- Application ----
    if (action === "add") {
      await grantPermission(guild.id, targetId, targetType, level);
      await replySuccess(message, `Niveau **${LEVEL_LABELS[level]}** accordé à ${display}.`);
    } else {
      const removed = await revokePermission(guild.id, targetId, level);
      if (!removed) {
        await replyError(message, `${display} n'avait pas le niveau **${LEVEL_LABELS[level]}**.`);
        return;
      }
      await replySuccess(message, `Niveau **${LEVEL_LABELS[level]}** retiré à ${display}.`);
    }

    // ---- Log de configuration ----
    const logEmbed = baseEmbed()
      .setTitle("⚙️ Permission interne modifiée")
      .setDescription(
        [
          `**Action :** ${action === "add" ? "Ajout" : "Retrait"}`,
          `**Niveau :** ${LEVEL_LABELS[level]} (\`${level}\`)`,
          `**Cible :** ${display} (\`${targetId}\`)`,
          `**Par :** <@${message.author.id}> (\`${message.author.id}\`)`,
        ].join("\n")
      );
    await sendLog(guild, "config", logEmbed);
  },
};

export default command;
