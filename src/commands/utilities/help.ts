import type { EmbedBuilder } from "discord.js";
import { config } from "../../config/config";
import { LEVEL_LABELS } from "../../services/permissionService";
import type { Command, CommandCategory } from "../../types";
import { baseEmbed, replyError } from "../../utils/embeds";

const CATEGORY_ORDER: CommandCategory[] = [
  "Utilitaire",
  "Administration",
  "Modération",
  "Giveaway",
  "Tickets",
  "Configuration",
  "Owner",
];

const CATEGORY_EMOJIS: Record<CommandCategory, string> = {
  Utilitaire: "🧰",
  Administration: "🛠️",
  Modération: "🔨",
  Giveaway: "🎉",
  Tickets: "🎫",
  Configuration: "⚙️",
  Owner: "👑",
};

const command: Command = {
  name: "help",
  aliases: ["aide", "h"],
  category: "Utilitaire",
  description: "Affiche la liste des commandes ou le détail d'une commande.",
  usage: "help [commande]",
  level: "USER",
  run: async (client, message, args) => {
    const prefix = config.prefix;

    // ------------------------------------------------------------------
    // Mode détail : +help <commande>
    // ------------------------------------------------------------------
    if (args[0]) {
      const target = client.resolveCommand(args[0]);
      if (!target || target.hidden) {
        await replyError(
          message,
          `Commande \`${args[0]}\` introuvable. Utilise \`${prefix}help\` pour la liste complète.`
        );
        return;
      }

      const detail = baseEmbed()
        .setTitle(`${CATEGORY_EMOJIS[target.category]} ${prefix}${target.name}`)
        .setDescription(target.description)
        .addFields(
          { name: "Syntaxe", value: `\`${prefix}${target.usage}\``, inline: false },
          { name: "Catégorie", value: target.category, inline: true },
          { name: "Permission requise", value: LEVEL_LABELS[target.level], inline: true }
        )
        .setFooter({ text: "<argument> obligatoire • [argument] facultatif" });

      if (target.aliases?.length) {
        detail.addFields({
          name: "Alias",
          value: target.aliases.map((alias) => `\`${prefix}${alias}\``).join(", "),
          inline: true,
        });
      }
      if (target.cooldown) {
        detail.addFields({ name: "Cooldown", value: `${target.cooldown} s`, inline: true });
      }

      await message.reply({ embeds: [detail], allowedMentions: { repliedUser: false } });
      return;
    }

    // ------------------------------------------------------------------
    // Liste complète : générée automatiquement depuis les commandes chargées,
    // groupée par catégories. Chaque ligne : syntaxe — description (niveau).
    // ------------------------------------------------------------------
    const embed: EmbedBuilder = baseEmbed()
      .setTitle(`${config.emojis.info} Aide — ${client.user.username}`)
      .setDescription(
        [
          `Préfixe : \`${prefix}\` — \`${prefix}help [commande]\` pour le détail d'une commande.`,
          `Légende : \`<argument>\` obligatoire • \`[argument]\` facultatif.`,
        ].join("\n")
      )
      .setThumbnail(client.user.displayAvatarURL({ size: 256 }));

    for (const category of CATEGORY_ORDER) {
      const commands = [...client.commands.values()]
        .filter((cmd) => cmd.category === category && !cmd.hidden)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (commands.length === 0) continue;

      const lines = commands.map(
        (cmd) => `\`${prefix}${cmd.usage}\` — ${cmd.description} *(${LEVEL_LABELS[cmd.level]})*`
      );
      embed.addFields({
        name: `${CATEGORY_EMOJIS[category]} ${category}`,
        value: lines.join("\n").slice(0, 1024),
        inline: false,
      });
    }

    embed.setFooter({
      text: `${client.commands.filter((cmd) => !cmd.hidden).size} commandes disponibles`,
    });

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};

export default command;
