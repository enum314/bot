import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

import type { Plugin } from "./plugin.js";

type CommandRunner = (
  interaction: ChatInputCommandInteraction<"cached">
) => Promise<any> | any;

type CommandAutocompleter = (
  interaction: AutocompleteInteraction<"cached">
) => Promise<any> | any;

export class Command {
  public data!: any;

  private _runner!: CommandRunner;
  private _autocomplete: CommandAutocompleter | null;

  public constructor(
    public readonly plugin: Plugin,
    builder: SlashCommandBuilder
  ) {
    this.data = builder.toJSON();

    this._autocomplete = null;
  }

  public get name() {
    return this.data.name;
  }

  public get description() {
    return this.data.description;
  }

  public get runner() {
    return this._runner;
  }

  public get autocompleter() {
    return this._autocomplete || null;
  }

  public run(
    fn: (
      interaction: ChatInputCommandInteraction<"cached">
    ) => Promise<any> | any
  ) {
    this._runner = fn;

    return this;
  }

  public autocomplete(
    fn: (interaction: AutocompleteInteraction<"cached">) => Promise<any> | any
  ) {
    this._autocomplete = fn;

    return this;
  }
}
