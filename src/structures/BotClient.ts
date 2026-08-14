import { Client, Collection, GatewayIntentBits, Partials } from "discord.js";
import type { Command } from "../types";

/**
 * Client étendu du bot.
 *
 * Intents utilisés (à activer aussi dans le Developer Portal, onglet Bot) :
 * - Guilds ............... serveurs, salons, rôles (base indispensable)
 * - GuildMembers ......... arrivées de membres (+join settings), résolution de membres  [PRIVILÉGIÉ]
 * - GuildMessages ........ réception des messages de serveur (commandes préfixées)
 * - MessageContent ....... lecture du CONTENU des messages (préfixe +)                  [PRIVILÉGIÉ]
 * - GuildPresences ....... lecture des statuts personnalisés (+soutien)                 [PRIVILÉGIÉ]
 *
 * Intents volontairement NON demandés car inutiles ici :
 * DirectMessages, GuildMessageReactions (on utilise des boutons), GuildVoiceStates, etc.
 */
export class BotClient extends Client<true> {
  /** Commandes indexées par nom. */
  public commands = new Collection<string, Command>();
  /** Alias -> nom de commande. */
  public aliases = new Collection<string, string>();

  public constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
      // Sécurité : par défaut le bot ne peut jamais ping @everyone/@here.
      allowedMentions: { parse: ["users", "roles"], repliedUser: false },
    });
  }

  /** Retrouve une commande par son nom ou un alias. */
  public resolveCommand(name: string): Command | undefined {
    const key = name.toLowerCase();
    return this.commands.get(key) ?? this.commands.get(this.aliases.get(key) ?? "");
  }
}
