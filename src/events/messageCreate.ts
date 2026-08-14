import { DiscordAPIError, PermissionsBitField } from "discord.js";
import { config } from "../config/config";
import { ensureGuild } from "../database/client";
import { hasPermissionLevel, LEVEL_LABELS } from "../services/permissionService";
import type { BotEvent } from "../types";
import { checkCooldown } from "../utils/cooldowns";
import { errorEmbed, replyError, replyWarn } from "../utils/embeds";

const event: BotEvent<"messageCreate"> = {
  name: "messageCreate",
  execute: async (client, message) => {
    // Filtres de base : bots, messages système, préfixe.
    if (message.author.bot || message.system) return;
    if (!message.content.startsWith(config.prefix)) return;

    const withoutPrefix = message.content.slice(config.prefix.length).trim();
    if (!withoutPrefix) return;
    const args = withoutPrefix.split(/\s+/);
    const commandName = args.shift()!.toLowerCase();

    const command = client.resolveCommand(commandName);
    if (!command) {
      // Commande inconnue : réponse discrète, limitée à 1 fois / 15 s / utilisateur.
      if (checkCooldown("::unknown", message.author.id, 15) === 0) {
        await replyWarn(
          message,
          `Commande inconnue. Utilise \`${config.prefix}help\` pour voir la liste des commandes.`
        );
      }
      return;
    }

    // Serveur uniquement (comportement par défaut de toutes les commandes).
    if (command.guildOnly !== false && !message.guild) {
      await replyError(message, "Cette commande est utilisable uniquement sur un serveur.");
      return;
    }
    // Sécurité : en message privé, seules les commandes de niveau USER sont possibles.
    if (!message.guild && command.level !== "USER") {
      await replyError(message, "Cette commande nécessite d'être exécutée sur un serveur.");
      return;
    }

    try {
      if (message.guild) {
        await ensureGuild(message.guild.id);

        // ------------------------------------------------------------------
        // CONTRÔLE DES PERMISSIONS INTERNES — centralisé dans permissionService,
        // exécuté AVANT toute action. Un membre normal ne peut JAMAIS exécuter
        // une commande sensible simplement parce qu'il connaît son nom.
        // ------------------------------------------------------------------
        const member =
          message.member ??
          (await message.guild.members.fetch(message.author.id).catch(() => null));
        if (!member) {
          await replyError(message, "Impossible de vérifier tes permissions. Réessaie.");
          return;
        }

        const allowed = await hasPermissionLevel(member, command.level);
        if (!allowed) {
          await replyError(
            message,
            `Tu n'as pas la permission d'utiliser cette commande.\n` +
              `Niveau requis : **${LEVEL_LABELS[command.level]}**.`
          );
          return;
        }

        // ------------------------------------------------------------------
        // Permissions Discord requises côté BOT (déclarées par la commande).
        // ------------------------------------------------------------------
        const me = message.guild.members.me;
        if (command.botPermissions?.length && me) {
          const missing = command.botPermissions.filter((perm) => !me.permissions.has(perm));
          if (missing.length > 0) {
            const names = new PermissionsBitField(missing).toArray().join(", ");
            await replyError(
              message,
              `Il me manque des permissions pour exécuter cette commande : \`${names}\`.\n` +
                `Demande à un administrateur de corriger mes permissions.`
            );
            return;
          }
        }
      }

      // ------------------------------------------------------------------
      // Cooldown anti-spam (par commande et par utilisateur).
      // ------------------------------------------------------------------
      const remaining = checkCooldown(command.name, message.author.id, command.cooldown ?? 0);
      if (remaining > 0) {
        await replyWarn(message, `Doucement ! Réessaie dans **${remaining} s**.`);
        return;
      }

      // Exécution — chaque commande gère ses arguments invalides et ses
      // vérifications spécifiques (hiérarchie de rôles, cibles, etc.).
      await command.run(client, message, args);
    } catch (error) {
      // Aucune commande ne doit jamais faire crasher le bot.
      console.error(`[COMMANDE:${command.name}] Erreur :`, error);
      let description =
        "Une erreur inattendue est survenue pendant l'exécution de la commande.";
      if (error instanceof DiscordAPIError) {
        description = `Erreur de l'API Discord (code \`${error.code}\`). Vérifie mes permissions puis réessaie.`;
      }
      await message
        .reply({ embeds: [errorEmbed(description)], allowedMentions: { repliedUser: false } })
        .catch(() => null);
    }
  },
};

export default event;
