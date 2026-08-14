import { ChannelType, type ColorResolvable, type TextChannel } from "discord.js";
import { prisma } from "../database/client";
import type { BotEvent } from "../types";
import { baseEmbed } from "../utils/embeds";
import { applyVariables, parseStringArray, truncate } from "../utils/text";

const event: BotEvent<"guildMemberAdd"> = {
  name: "guildMemberAdd",
  execute: async (_client, member) => {
    if (member.user.bot) return;

    const settings = await prisma.joinSettings.findUnique({
      where: { guildId: member.guild.id },
    });
    if (!settings?.enabled) return;

    const ctx = { user: member.user, guild: member.guild };

    // 1) Rôles automatiques (plusieurs possibles) — contrôle de hiérarchie.
    for (const roleId of parseStringArray(settings.autoRoles)) {
      const role = member.guild.roles.cache.get(roleId);
      if (!role) continue;
      const me = member.guild.members.me;
      if (!me || role.position >= me.roles.highest.position || role.managed) continue;
      await member.roles.add(role, "Rôle automatique (join settings)").catch((error: unknown) => {
        console.warn(`[JOIN] Rôle ${roleId} non attribué (guild ${member.guild.id}) :`, error);
      });
    }

    // 2) Message de bienvenue dans le salon configuré (embed ou message simple).
    if (settings.channelId) {
      const channel =
        member.guild.channels.cache.get(settings.channelId) ??
        (await member.guild.channels.fetch(settings.channelId).catch(() => null));
      if (channel && channel.type === ChannelType.GuildText) {
        const text = truncate(applyVariables(settings.message, ctx), 1900);
        const welcomeChannel = channel as TextChannel;
        if (settings.useEmbed) {
          const embed = baseEmbed(settings.embedColor as ColorResolvable)
            .setAuthor({
              name: member.user.username,
              iconURL: member.user.displayAvatarURL({ size: 128 }),
            })
            .setDescription(text)
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
          await welcomeChannel
            .send({ embeds: [embed], allowedMentions: { users: [member.id] } })
            .catch(() => null);
        } else {
          await welcomeChannel
            .send({ content: text, allowedMentions: { users: [member.id] } })
            .catch(() => null);
        }
      }
    }

    // 3) Message privé éventuel (DM fermés : ignoré proprement).
    if (settings.dmEnabled && settings.dmMessage) {
      await member
        .send({ content: truncate(applyVariables(settings.dmMessage, ctx), 1900) })
        .catch(() => null);
    }
  },
};

export default event;
