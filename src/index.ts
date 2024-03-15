import "dotenv/config";

import { GatewayIntentBits } from "discord.js";
import ms from "ms";

import { Client } from "./classes/client.js";

const startingTime = Date.now();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.logger.info("Loading...");

client.logger.info(`[Discord] Connecting...`);

client.once("ready", async () => {
  await client.plugins.initialize();
  await client.dispatcher.initialize();

  client.logger.info(`[Discord] ${client.user?.tag} / ${client.user?.id}`);

  client.logger.info(`Done! ${ms(Date.now() - startingTime)}`);

  const plugins = client.plugins.getPlugins();

  for (const plugin of plugins) {
    const context = plugin.getContext();

    await plugin.readyFn(context);
  }
});

client.login().catch((error) => client.logger.error(error));
