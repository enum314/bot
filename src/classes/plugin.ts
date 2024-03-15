import type { ClientEvents } from "discord.js";
import semverRegex from "semver-regex";
import { z } from "zod";

import type {
  ClientEventListener,
  Context,
  InhibitorFunction,
  PluginConfiguration,
} from "../types/types.js";
import Logger from "../utils/logger.js";
import { Command } from "./command.js";

const PluginName = z.string().refine((arg) => /^[A-Za-z0-9_-]+$/.test(arg), {
  message:
    "Plugin name should contain only alphanumeric characters, hyphens, or underscores.",
});

const PluginVersion = z.string().refine((arg) => semverRegex().test(arg), {
  message:
    "Plugin version should match the semver format. (https://semver.org/)",
});

const PluginAuthor = z.string().refine((arg) => /^[a-z0-9]+$/.test(arg), {
  message: "Plugin author should be lowercase alphanumeric with no spaces.",
});

const AuthorPluginName = z.string().refine(
  (arg) => {
    const match = /^@([a-z0-9]+)\/([a-z0-9_-]+)$/i.exec(arg);

    if (!match) return false;

    const [, author, pluginName] = match;

    return (
      author.length >= 3 &&
      author.length <= 16 &&
      pluginName.length >= 3 &&
      pluginName.length <= 32
    );
  },
  {
    message: "AuthorPluginName should be in the format @author/plugin-name",
  }
);

const Metadata = z
  .object({
    name: PluginName,
    description: z
      .string()
      .min(
        3,
        `Plugin.metadata.description should have a minimum length of 3 characters.`
      )
      .max(
        128,
        `Plugin.metadata.description should not exceed a maximum of 128 characters.`
      ),
    version: PluginVersion,
    author: PluginAuthor,
    dependencies: z.record(AuthorPluginName, PluginVersion),
    optionalDependencies: z.record(AuthorPluginName, PluginVersion),
  })
  .strict();

type PluginMetadata = z.infer<typeof Metadata> & {
  version: `${number}.${number}.${number}`;
  dependencies: Record<
    `@${string}/${string}`,
    `${"" | "^" | "~" | ">" | "<" | ">=" | "<="}${number}.${number}.${number}`
  >;
  optionalDependencies: Record<
    `@${string}/${string}`,
    `${"" | "^" | "~" | ">" | "<" | ">=" | "<="}${number}.${number}.${number}`
  >;
};

type ExtractPluginNameFromAuthorPluginName<T> =
  T extends `@${string}/${infer Name}` ? Name : T;

type SetupFunction<
  PluginConfig extends PluginConfiguration = any,
  PluginMeta extends PluginMetadata = any,
  Dependency extends
    keyof PluginMeta["dependencies"] = keyof PluginMeta["dependencies"],
  OptionalDependency extends
    keyof PluginMeta["optionalDependencies"] = keyof PluginMeta["optionalDependencies"],
> = (
  ctx: Context<PluginConfig>,
  dependencies: Record<
    ExtractPluginNameFromAuthorPluginName<Dependency>,
    Plugin<any, any>["api"]
  >,
  optionalDependencies: Partial<
    Record<
      ExtractPluginNameFromAuthorPluginName<OptionalDependency>,
      Plugin<any, any>["api"]
    >
  >
) => Promise<void>;

export class Plugin<
  Api extends object = any,
  PluginConfig extends PluginConfiguration = any,
  PluginMeta extends PluginMetadata = any,
> {
  private context!: Context<PluginConfig>;

  public constructor(opts: { metadata: PluginMeta; configs: PluginConfig }) {
    this.metadata = Metadata.parse(opts.metadata) as PluginMeta;
    this.configs = opts.configs;

    this.setupFn = async () => {
      throw new Error(`Plugin - ${this.name} does not have a setup function.`);
    };

    this.errorFn = async (err: any) => {
      throw err;
    };

    this.readyFn = async ({ logger }) => {
      logger.info(this.description);
    };

    this.api = {} as Api;
  }

  public readonly metadata!: PluginMeta;
  public readonly configs: PluginConfig;

  public commands: Command[] = [];

  public events: {
    execution: "on" | "once";
    eventName: keyof ClientEvents;
    listener: ClientEventListener<any>;
  }[] = [];

  public inhibitors: InhibitorFunction[] = [];

  public setupFn: SetupFunction<PluginConfig, PluginMeta>;

  public errorFn: (err: any) => Promise<void> | void;
  public readyFn: (ctx: Context<PluginConfig>) => Promise<void> | void;

  public api: Api;

  public get name() {
    return this.metadata.name;
  }

  public get description() {
    return this.metadata.description;
  }

  public get version() {
    return this.metadata.version;
  }

  public get author() {
    return this.metadata.author;
  }

  public get dependencies() {
    return this.metadata.dependencies;
  }

  public get optionalDependencies() {
    return this.metadata.optionalDependencies;
  }

  private get logger() {
    return {
      info: (message: string) => Logger.info(`[${this.name}] ${message}`),
      warn: (message: string) => Logger.warn(`[${this.name}] ${message}`),
      error: (message: string) => Logger.error(`[${this.name}] ${message}`),
    };
  }

  public getContext() {
    return this.context;
  }

  public setContext(context: Context<PluginConfig>) {
    this.context = context;
  }

  public addCommand(command: Command) {
    const handler = command.handler;

    command.dispatch(async (interaction) => {
      try {
        return handler(interaction);
      } catch (err) {
        this.logger.error(`Command - ${interaction.commandName}`).error(err);

        this.errorFn(err);
      }
    });

    this.commands = [
      ...this.commands.filter(
        (override) => override.name !== command.name.toLowerCase()
      ),
      command,
    ];

    return this;
  }

  public addEvent<K extends keyof ClientEvents>(
    execution: "on" | "once",
    eventName: K,
    listener: ClientEventListener<K>
  ) {
    this.events.push({
      execution,
      eventName,
      listener: async (...args) => {
        try {
          await listener(...(args as any));
        } catch (err: any) {
          this.logger.error(`Event - ${eventName}`).error(err);

          this.errorFn(err);
        }
      },
    });

    return this;
  }

  public addInhibitor(inhibitor: InhibitorFunction) {
    this.inhibitors.push((interaction, command) => {
      try {
        return inhibitor(interaction, command);
      } catch (err) {
        this.logger.error(`Inhibitor - ${inhibitor.name}`).error(err);

        this.errorFn(err);

        return false;
      }
    });
  }

  public setup(fn: SetupFunction<PluginConfig, PluginMeta>) {
    this.setupFn = fn;
  }

  public error(fn: (err: any) => Promise<void> | void) {
    this.errorFn = fn;
  }

  public ready(fn: (ctx: Context<PluginConfig>) => Promise<void> | void) {
    this.readyFn = fn;
  }
}
