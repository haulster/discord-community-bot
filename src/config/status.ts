import { ActivityType } from "discord.js";

export interface RotatingStatus {
  /** Texte affiché. Variables disponibles : {servers}, {members}, {prefix} */
  text: string;
  type: Exclude<ActivityType, ActivityType.Custom>;
}

/**
 * Statuts affichés en rotation lorsque BOT_STATUS_ROTATION=true dans .env.
 * Modifie librement cette liste (ordre, textes, types).
 */
export const rotatingStatuses: RotatingStatus[] = [
  { text: "{prefix}help", type: ActivityType.Playing },
  { text: "{servers} serveurs", type: ActivityType.Watching },
  { text: "{members} membres", type: ActivityType.Listening },
];
