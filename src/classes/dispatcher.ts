import {
  ApplicationCommand,
  ChatInputCommandInteraction,
  Client,
  REST,
  Routes,
} from "discord.js";

import { existsFile, readFile, writeFile } from "../exports/file-system.js";
import type { InhibitorFunction } from "../types/types";
import type { Command } from "./command";

export default class Dispatcher {
  public readonly awaiting: Set<string>;
  public readonly inhibitors: InhibitorFunction[];

  private init: boolean;

  public constructor(private client: Client<true>) {
    this.awaiting = new Set();
    this.inhibitors = [];
    this.init = false;
  }

  private async sync() {
    const commands = this.client.commands.map((x) => x.data);

    if (!this.client.application?.owner) {
      await this.client.application?.fetch();
    }

    let modified = false;

    if (await existsFile(["cache.json"])) {
      try {
        const currentCommands = JSON.parse(
          (await readFile(["cache.json"])).toString()
        );

        const newCommands = commands.filter(
          (command) =>
            !currentCommands.some(
              (c: { name: string }) => c.name === command.name
            )
        );

        if (newCommands.length) {
          throw new Error();
        }

        const deletedCommands = currentCommands.filter(
          (command: { name: string }) =>
            !commands.some((c) => c.name === command.name)
        );

        if (deletedCommands.length) {
          throw new Error();
        }

        const updatedCommands = commands.filter((command) =>
          currentCommands.some((c: { name: string }) => c.name === command.name)
        );

        for (const updatedCommand of updatedCommands) {
          const previousCommand = currentCommands.find(
            (c: { name: string }) => c.name === updatedCommand.name
          );

          if (!previousCommand) continue;

          if (previousCommand.description !== updatedCommand.description) {
            throw new Error();
          }

          if (
            !ApplicationCommand.optionsEqual(
              previousCommand.options ?? [],
              updatedCommand.options ?? []
            )
          ) {
            throw new Error();
          }
        }
      } catch (err) {
        modified = true;
      }
    } else {
      modified = true;
    }

    if (modified) {
      this.client.logger.info(
        `[Dispatcher] Syncing ${commands.length} Slash Command${
          commands.length > 1 ? "s" : ""
        }...`
      );

      const rest = new REST().setToken(this.client.token);

      rest.put(
        Routes.applicationGuildCommands(
          this.client.user.id,
          process.env.DISCORD_GUILD_ID as string
        ),
        {
          body: commands,
        }
      );

      await writeFile(["cache.json"], JSON.stringify(commands));

      this.client.logger.info(
        `[Dispatcher] ${commands.length} Slash Command${
          commands.length > 1 ? "s" : ""
        } synced!`
      );
    }
  }

  private async inihibit(
    interaction: ChatInputCommandInteraction<"cached">,
    command: Command
  ) {
    for (const inhibitor of this.inhibitors) {
      if (!(await Promise.resolve(inhibitor(interaction, command)))) {
        return true;
      }
    }
    return false;
  }

  public async initialize() {
    if (this.init) {
      throw new Error(`Dispatcher has already been initialized`);
    }

    this.init = true;

    await this.sync();

    this.client.on("interactionCreate", async (interaction) => {
      if (
        interaction.user.bot ||
        this.awaiting.has(interaction.user.id) ||
        !interaction.isChatInputCommand() ||
        !interaction.inCachedGuild()
      ) {
        return;
      }

      const command = this.client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      this.awaiting.add(interaction.user.id);

      if (!(await this.inihibit(interaction, command))) {
        await command.runner(interaction);
      }

      this.awaiting.delete(interaction.user.id);
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (
        interaction.user.bot ||
        this.awaiting.has(interaction.user.id) ||
        !interaction.isAutocomplete() ||
        !interaction.inCachedGuild()
      ) {
        return;
      }

      const command = this.client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      if (!command.autocompleter) {
        return;
      }

      this.awaiting.add(interaction.user.id);

      await command.autocompleter(interaction);

      this.awaiting.delete(interaction.user.id);
    });
  }
}
