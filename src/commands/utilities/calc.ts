import { all, create } from "mathjs";
import { config } from "../../config/config";
import type { Command } from "../../types";
import { baseEmbed, replyError } from "../../utils/embeds";
import { truncate } from "../../utils/text";

// Instance mathjs durcie (pattern officiel de la doc mathjs) : on capture
// l'évaluateur d'origine puis on désactive les fonctions dangereuses dans le
// scope d'évaluation. JAMAIS de eval() JavaScript.
const math = create(all, {});
const limitedEvaluate = math.evaluate;
math.import(
  {
    import: () => {
      throw new Error("Fonction désactivée.");
    },
    createUnit: () => {
      throw new Error("Fonction désactivée.");
    },
    evaluate: () => {
      throw new Error("Fonction désactivée.");
    },
    parse: () => {
      throw new Error("Fonction désactivée.");
    },
    simplify: () => {
      throw new Error("Fonction désactivée.");
    },
    derivative: () => {
      throw new Error("Fonction désactivée.");
    },
  },
  { override: true }
);

const command: Command = {
  name: "calc",
  aliases: ["math", "calcul"],
  category: "Utilitaire",
  description: "Calcule une expression mathématique (sécurisé, sans eval).",
  usage: "calc <calcul>",
  level: "USER",
  cooldown: 3,
  run: async (_client, message, args) => {
    const expression = args.join(" ").trim();
    if (!expression) {
      await replyError(
        message,
        `Syntaxe : \`${config.prefix}calc <calcul>\`\nExemples : \`${config.prefix}calc 2 + 2 * 10\`, \`${config.prefix}calc sqrt(144)\`, \`${config.prefix}calc 15% * 200\``
      );
      return;
    }
    if (expression.length > 300) {
      await replyError(message, "Expression trop longue (300 caractères maximum).");
      return;
    }

    try {
      const result = limitedEvaluate(expression);
      if (typeof result === "function" || result === undefined) {
        throw new Error("Résultat invalide.");
      }
      const formatted = truncate(math.format(result, { precision: 14 }), 1000);

      const embed = baseEmbed()
        .setTitle("🧮 Calculatrice")
        .addFields(
          { name: "Expression", value: `\`\`\`${truncate(expression, 500)}\`\`\``, inline: false },
          { name: "Résultat", value: `\`\`\`${formatted}\`\`\``, inline: false }
        );
      await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await replyError(message, `Calcul invalide : ${truncate(detail, 200)}`);
    }
  },
};

export default command;
