import { SlashCommandBuilder } from "discord.js";
import ms from "ms";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { z } from "zod";

import { Command } from "#bot/command";
import { Plugin } from "#bot/plugin";

const plugin = new Plugin({
  metadata: {
    name: "cooldowns",
    description: "A plugin to handle command cooldowns.",
    version: "1.0.0",
    author: "enum314",
    dependencies: {
      "@enum314/super-placeholders": "^1.0.0",
    },
    optionalDependencies: {},
  },
  configs: {
    commands: z
      .object({
        commands: z
          .array(
            z
              .object({
                name: z.string(),
                points: z.number(),
                duration: z.number(),
              })
              .strict()
          )
          .default([]),
      })
      .strict(),

    lang: z
      .object({
        message: z
          .string()
          .default(
            `Oops, please wait another **{{time_remaining}}** to use that command again :)`
          ),
      })
      .strict(),
  },
});

plugin.setup(async ({ configs }, deps) => {
  const lang = await configs.lang.read();

  const placeholder = deps[
    "super-placeholders"
  ] as (typeof import("./super-placeholders.js"))["default"]["api"];

  (plugin.api as CooldownsApi) = {
    storage: new Map(),
  };

  plugin.addCommand(
    new Command(
      plugin,
      new SlashCommandBuilder().setName("ping").setDescription("Ping!")
    ).run(async (interaction) => {
      await interaction.reply("Pong!");
    })
  );

  plugin.addInhibitor(async (interaction, command) => {
    try {
      const limiter = (plugin.api as CooldownsApi).storage.get(command.name);

      if (limiter) {
        await limiter.consume(interaction.user.id);
      }

      return true;
    } catch (data) {
      if (data instanceof RateLimiterRes) {
        await interaction.reply({
          content: placeholder.render(lang.message, {
            time_remaining: ms(data.msBeforeNext),
          }),
          ephemeral: true,
        });
      }

      return false;
    }
  });
});

plugin.ready(async ({ client, configs }) => {
  const { commands } = await configs.commands.read();

  for (const command of commands) {
    const limiter = new RateLimiterMemory({
      points: command.points,
      duration: command.duration,
    });

    (plugin.api as CooldownsApi).storage.set(command.name, limiter);
  }

  const unregisteredCommands = client.commands
    .filter((command) => !commands.some((c) => c.name === command.name))
    .map((command) => command);

  for (const command of unregisteredCommands) {
    (plugin.api as CooldownsApi).storage.set(
      command.name,
      new RateLimiterMemory({
        keyPrefix: `command:${command.name}`,
        points: 1,
        duration: 3,
      })
    );

    commands.push({
      name: command.name,
      points: 1,
      duration: 3,
    });
  }

  await configs.commands.edit({ commands });
});

interface CooldownsApi {
  storage: Map<string, RateLimiterMemory>;
}

export default plugin as Plugin<CooldownsApi>;
