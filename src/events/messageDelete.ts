import { recordDeletedMessage } from "../services/snipeService";
import type { BotEvent } from "../types";

const event: BotEvent<"messageDelete"> = {
  name: "messageDelete",
  execute: (_client, message) => {
    recordDeletedMessage(message);
  },
};

export default event;
