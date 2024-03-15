import type { PermissionsString } from "discord.js";
import { z } from "zod";

import { Plugin } from "#bot/plugin";

const plugin = new Plugin({
  metadata: {
    name: "check-permissions",
    description: "A plugin to check permissions before executing a command.",
    version: "1.0.0",
    author: "enum314",
    dependencies: {
      "@enum314/super-placeholders": "1.0.0",
    },
    optionalDependencies: {
      "@enum314/cooldowns": "1.0.0",
    },
  },
  configs: {
    commands: z
      .object({
        commands: z
          .array(
            z
              .object({
                name: z.string(),
                userPermissions: z.array(z.string()),
                clientPermissions: z.array(z.string()),
              })
              .strict()
          )
          .default([]),
      })
      .strict(),
    lang: z
      .object({
        missing_permissions: z
          .object({
            bot: z.string(),
            user: z.string(),
          })
          .strict()
          .default({
            bot: `Oops, I need {{missing_permissions}} permission(s) to execute this command`,
            user: `Oops, You need {{missing_permissions}} permission(s) to execute this command`,
          }),
      })
      .strict(),
  },
});

plugin.setup(async ({ configs }, deps) => {
  const lang = await configs.lang.read();

  const placeholder = deps[
    "super-placeholders"
  ] as (typeof import("./super-placeholders.js"))["default"]["api"];

  (plugin.api as CheckPermissionsApi) = {
    storage: new Map<
      string,
      {
        clientPermissions: string[];
        userPermissions: string[];
      }
    >(),
  };

  plugin.addInhibitor(async (interaction, command) => {
    const perms = (plugin.api as CheckPermissionsApi).storage.get(command.name);

    if (!perms) return true;

    if (
      perms.clientPermissions.length &&
      (!interaction.guild.members.me?.permissions?.has(
        perms.clientPermissions as PermissionsString[]
      ) ||
        !(
          interaction.channel &&
          interaction.channel
            .permissionsFor(interaction.guild.members.me)
            ?.has(perms.clientPermissions as PermissionsString[])
        ))
    ) {
      await interaction.reply({
        content: placeholder.replace(lang.missing_permissions.bot, {
          missing_permissions: perms.clientPermissions.join(", "),
        }),
        ephemeral: true,
      });

      return false;
    }

    return true;
  });

  plugin.addInhibitor(async (interaction, command) => {
    const perms = (plugin.api as CheckPermissionsApi).storage.get(command.name);

    if (!perms) return true;

    if (
      perms.userPermissions.length &&
      !interaction.memberPermissions?.has(
        perms.userPermissions as PermissionsString[]
      )
    ) {
      await interaction.reply({
        content: placeholder.replace(lang.missing_permissions.user, {
          missing_permissions: perms.userPermissions.join(", "),
        }),
        ephemeral: true,
      });

      return false;
    }

    return true;
  });
});

plugin.ready(async ({ client, configs }) => {
  const { commands } = await configs.commands.read();

  for (const command of commands) {
    (plugin.api as CheckPermissionsApi).storage.set(command.name, {
      clientPermissions: command.clientPermissions,
      userPermissions: command.userPermissions,
    });
  }

  const unregisteredCommands = client.commands
    .filter((command) => !commands.some((c) => c.name === command.name))
    .map((command) => command);

  for (const command of unregisteredCommands) {
    (plugin.api as CheckPermissionsApi).storage.set(command.name, {
      clientPermissions: [],
      userPermissions: [],
    });

    commands.push({
      name: command.name,
      clientPermissions: [],
      userPermissions: [],
    });
  }

  await configs.commands.edit({ commands });
});

interface CheckPermissionsApi {
  storage: Map<
    string,
    {
      clientPermissions: string[];
      userPermissions: string[];
    }
  >;
}

export default plugin as Plugin<CheckPermissionsApi>;
